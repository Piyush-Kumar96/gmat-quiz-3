#!/usr/bin/env python3
import os
import json
import glob
import requests
import time
import random
import argparse
import re
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

# Constants for RC Exam Packs Questions - Sequential Version
HTML_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/html_rc_exampacks')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/processed_rc_exampacks_direct_extraction')
CHECKPOINT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/rc_exampacks_direct_extraction_checkpoint.json')
ERROR_LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/rc_exampacks_direct_extraction_errors.log')
BATCH_SIZE = 10  # Process in batches for checkpoint frequency
MAX_RETRIES = 3  # Maximum retries for extraction
RETRY_DELAY = 3  # Delay between retries in seconds
MIN_REQUEST_DELAY = 0.2  # Minimum delay between files
MAX_REQUEST_DELAY = 0.8  # Maximum delay between files
TEST_MODE_LIMIT = 3  # Limit to 3 RC passages for initial testing

# Create output directory if it doesn't exist
os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_html_file(file_path):
    """Load and parse HTML file with RC structure (passage + multiple questions)"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Parse HTML
    soup = BeautifulSoup(content, 'html.parser')
    
    # Extract RC number from filename
    rc_number = os.path.basename(file_path).replace('rc_', '').replace('.html', '')
    
    # Extract source URL
    source_url = soup.select_one('.source-url a')['href'] if soup.select_one('.source-url a') else ""
    
    # Extract metadata
    metadata = {
        'source': '',
        'type': '',
        'difficulty_level': '',
        'topic': '',
        'source_url': source_url  # Include source_url in metadata
    }
    
    metadata_div = soup.select_one('.metadata')
    if metadata_div:
        for div in metadata_div.select('div'):
            text = div.get_text(strip=True)
            if 'Source:' in text:
                metadata['source'] = text.replace('Source:', '').strip()
            elif 'Type:' in text:
                metadata['type'] = text.replace('Type:', '').strip()
            elif 'Difficulty Level:' in text:
                metadata['difficulty_level'] = text.replace('Difficulty Level:', '').strip()
            elif 'Topic:' in text:
                metadata['topic'] = text.replace('Topic:', '').strip()
    
    # Extract RC passage - ensuring this is not empty
    passage_div = soup.select_one('.reading-passage')
    passage_text = ""
    if passage_div:
        passage_text = passage_div.get_text(separator=' ', strip=True)
        print(f"Extracted passage of length {len(passage_text)} characters")
    else:
        print("WARNING: No passage found with .reading-passage selector")
        # Try alternative selectors if needed
        passage_div = soup.select_one('.reading.passage')
        if passage_div:
            passage_text = passage_div.get_text(separator=' ', strip=True)
            print(f"Using alternative selector, extracted passage of length {len(passage_text)} characters")
    
    # Find all timer placeholders to locate questions
    questions = []
    question_sections = []
    
    # Method 1: Find the questions directly after timer placeholders
    timer_placeholders = soup.find_all(id=re.compile(r'rc_timer_placeholder_\d+'))
    
    for timer_placeholder in timer_placeholders:
        # Move to the next sibling after the timer placeholder which should contain the question
        next_elements = []
        current_element = timer_placeholder.next_sibling
        
        # Collect all elements until we hit the next timer placeholder or end
        while current_element:
            if isinstance(current_element, str) and current_element.strip():
                next_elements.append(current_element.strip())
            elif hasattr(current_element, 'name') and current_element.name is not None:
                # Stop if we hit another timer placeholder
                if 'rc_timer_placeholder' in current_element.get('id', ''):
                    break
                # Add the text content if it's not empty
                content = current_element.get_text(strip=True)
                if content:
                    next_elements.append(content)
            current_element = current_element.next_sibling
            
        if next_elements:
            # Get the text after the timer placeholder
            question_text = " ".join(next_elements)
            
            # Try to extract the question number
            question_number_match = re.search(r'Question\s+(\d+)', timer_placeholder.get_text(strip=True))
            question_number = int(question_number_match.group(1)) if question_number_match else len(questions) + 1
            
            # Extract answer options from the HTML after the timer placeholder
            options_text = ""
            options = {}
            option_matches = re.findall(r'\(([A-E])\)\s+(.*?)(?=\([A-E]\)|$)', question_text)
            for letter, text in option_matches:
                options[letter] = text.strip()
                # Remove the option from the question text
                question_text = question_text.replace(f"({letter}) {text}", "").strip()
            
            # If we didn't find options with the regex, try to extract them more precisely
            if not options:
                # Look for options in specific format: (A) option text, (B) option text, etc.
                option_pattern = r'\(([A-E])\)\s*(.*?)(?=\s*\([A-E]\)|\s*$)'
                option_matches = re.findall(option_pattern, question_text)
                for letter, text in option_matches:
                    options[letter] = text.strip()
                    # Remove the option from the question text
                    question_text = question_text.replace(f"({letter}) {text}", "").strip()
            
            # Try to extract the correct answer from a spoiler div
            correct_answer = ""
            # Find the spoiler box that comes right after the timer placeholder
            spoiler_div = timer_placeholder.find_next('div', class_='spoiler')
            if spoiler_div:
                spoiler_hidden = spoiler_div.select_one('.spoiler-hidden')
                if spoiler_hidden:
                    correct_answer = spoiler_hidden.get_text(strip=True)
            
            # Extract answer statistics
            answer_stats = {}
            answer_stats_div = timer_placeholder.select_one('.correctAnswerBlock')
            if answer_stats_div:
                stats_elements = answer_stats_div.select('.statisticWrapExisting')
                for stat_element in stats_elements:
                    answer_type = stat_element.select_one('.answerType')
                    answer_percentage = stat_element.select_one('.answerPercentage')
                    if answer_type and answer_percentage:
                        answer_stats[answer_type.get_text(strip=True).lower()] = answer_percentage.get_text(strip=True)
            
            # Extract session statistics
            session_stats = {}
            session_div = timer_placeholder.select_one('.timerResult .timerResultLeft')
            if session_div:
                # Extract difficulty
                difficulty_div = session_div.select_one('.difficulty')
                if difficulty_div:
                    difficulty_level = difficulty_div.select_one('b')
                    if difficulty_level:
                        session_stats['difficulty_level'] = difficulty_level.get_text(strip=True)
                    difficulty_text = difficulty_div.get_text(strip=True)
                    match = re.search(r'\((.*?)\)', difficulty_text)
                    if match:
                        session_stats['difficulty_category'] = match.group(1)
                
                # Extract question stats
                question_stats = session_div.select_one('.question')
                if question_stats:
                    correct_percentage = question_stats.select_one('b')
                    if correct_percentage:
                        session_stats['correct_percentage'] = correct_percentage.get_text(strip=True)
                    
                    correct_time = question_stats.select_one('small')
                    if correct_time:
                        session_stats['correct_time'] = correct_time.get_text(strip=True)
                    
                    wrong_percentage = question_stats.select_one('.red b')
                    if wrong_percentage:
                        session_stats['wrong_percentage'] = wrong_percentage.get_text(strip=True)
                    
                    wrong_time = question_stats.select_one('.red small')
                    if wrong_time:
                        session_stats['wrong_time'] = wrong_time.get_text(strip=True)
                    
                    sessions_count = question_stats.select_one('.black b')
                    if sessions_count:
                        session_stats['sessions_count'] = sessions_count.get_text(strip=True)
            
            # Clean up question text - extract just the actual question
            # First try to find numbered questions like "1. Question text"
            question_match = re.search(r'^\d+\.\s+(.*?)(?=\s*\(A\)|\s*$)', question_text)
            if question_match:
                question_text = question_match.group(1).strip()
            else:
                # Otherwise, just use the text up to the first option
                question_text = re.sub(r'\s*\([A-E]\).*', '', question_text).strip()
            
            # Extract just the question by removing the question number if present
            question_text = re.sub(r'^\d+\.\s+', '', question_text)
            
            # Remove "Show Spoiler" and answer letter from the beginning if present
            question_text = re.sub(r'^Show\s+Spoiler[A-E]?\s*', '', question_text)
            
            questions.append({
                "rc_number": rc_number,
                "question_number": question_number,
                "question_text": question_text,
                "options": options,
                "correct_answer": correct_answer,
                "answer_stats": answer_stats,
                "session_stats": session_stats
            })
    
    # If we didn't find any questions using the timer placeholder method,
    # try using another approach (look for question text directly)
    if not questions:
        print(f"No questions found with timer placeholder method for RC {rc_number}. Trying alternative method...")
        # Look for question sections directly in the HTML
        question_number = 1
        for question_section in soup.select('div.questions-container > div.spoiler'):
            # Extract question text - it's typically right after the spoiler div
            question_text = ""
            next_element = question_section.next_sibling
            while next_element and not (hasattr(next_element, 'name') and next_element.name == 'div' and 'rc_timer_placeholder' in next_element.get('id', '')):
                if isinstance(next_element, str) and next_element.strip():
                    question_text += next_element.strip() + " "
                elif hasattr(next_element, 'get_text'):
                    question_text += next_element.get_text(strip=True) + " "
                next_element = next_element.next_sibling
            
            # Extract options from question text
            options = {}
            option_pattern = r'\(([A-E])\)\s*(.*?)(?=\s*\([A-E]\)|\s*$)'
            option_matches = re.findall(option_pattern, question_text)
            for letter, text in option_matches:
                options[letter] = text.strip()
                # Remove the option from the question text
                question_text = question_text.replace(f"({letter}) {text}", "").strip()
            
            # Extract the correct answer from spoiler
            correct_answer = ""
            spoiler_hidden = question_section.select_one('.spoiler-hidden')
            if spoiler_hidden:
                correct_answer = spoiler_hidden.get_text(strip=True)
            
            # Clean up question text - remove question number if present
            question_text = re.sub(r'^\d+\.\s+', '', question_text).strip()
            
            # Remove "Show Spoiler" and answer letter from the beginning if present
            question_text = re.sub(r'^Show\s+Spoiler[A-E]?\s*', '', question_text)
            
            questions.append({
                "rc_number": rc_number,
                "question_number": question_number,
                "question_text": question_text,
                "options": options,
                "correct_answer": correct_answer,
                "answer_stats": {},  # Will be populated later if found
                "session_stats": {}  # Will be populated later if found
            })
            question_number += 1
    
    # If we still don't have questions, try one more method
    if not questions:
        print(f"Still no questions found for RC {rc_number}. Trying final fallback method...")
        # Look for questions by searching for text patterns in the HTML
        content_text = soup.get_text()
        question_patterns = [
            r'(\d+)\.\s+([^(]+)\s*\(A\)\s*([^(]+)\s*\(B\)\s*([^(]+)\s*\(C\)\s*([^(]+)\s*\(D\)\s*([^(]+)(?:\s*\(E\)\s*([^(]+))?'
        ]
        
        for pattern in question_patterns:
            matches = re.findall(pattern, content_text)
            for match in matches:
                question_number = int(match[0])
                question_text = match[1].strip()
                options = {
                    'A': match[2].strip(),
                    'B': match[3].strip(),
                    'C': match[4].strip(),
                    'D': match[5].strip()
                }
                if len(match) > 6 and match[6].strip():
                    options['E'] = match[6].strip()
                
                # Try to find the correct answer in spoiler divs
                correct_answer = ""
                spoiler_divs = soup.select('.spoiler-hidden')
                if len(spoiler_divs) >= question_number:
                    correct_answer = spoiler_divs[question_number-1].get_text(strip=True)
                
                questions.append({
                    "rc_number": rc_number,
                    "question_number": question_number,
                    "question_text": question_text,
                    "options": options,
                    "correct_answer": correct_answer,
                    "answer_stats": {},
                    "session_stats": {}
                })
    
    # Print a summary of what was found
    print(f"Found {len(questions)} questions for RC {rc_number}")
    return {
        "rc_number": rc_number,
        "source_url": source_url,
        "passage_text": passage_text,
        "metadata": metadata,
        "questions": questions
    }

def save_result(file_path, result):
    """Save result to a JSON file"""
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Saved result to {file_path}")

def load_checkpoint():
    """Load checkpoint file if it exists"""
    try:
        if os.path.exists(CHECKPOINT_FILE):
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"processed_files": [], "processed_questions": []}
    except Exception as e:
        print(f"Error loading checkpoint: {str(e)}")
        return {"processed_files": [], "processed_questions": []}

def save_checkpoint(processed_files, processed_questions):
    """Save checkpoint information"""
    try:
        with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                "processed_files": processed_files,
                "processed_questions": processed_questions
            }, f, indent=2)
    except Exception as e:
        print(f"Error saving checkpoint: {str(e)}")

def process_rc_questions_sequentially(rc_data, processed_questions):
    """Process all questions in an RC passage sequentially"""
    results = []
    rc_number = rc_data["rc_number"]
    
    for question_data in rc_data["questions"]:
        question_number = question_data["question_number"]
        question_id = f"{rc_number}_{question_number}"
        
        # Check if already processed
        if question_id in processed_questions:
            print(f"Skipping already processed question: RC {rc_number} Question {question_number}")
            results.append({
                "status": "skipped", 
                "rc_number": rc_number,
                "question_number": question_number,
                "question_id": question_id,
                "processing_time": 0
            })
            continue
        
        print(f"\nProcessing RC {rc_number} Question {question_number}")
        start_time = time.time()
        
        try:
            # Create the output structure
            result = {
                "passage_text": rc_data["passage_text"],
                "question_text": question_data["question_text"],
                "options": question_data["options"],
                "correct_answer": question_data["correct_answer"],
                "question_type": "Reading Comprehension",
                "rc_number": rc_number,
                "question_number": question_number,
                "answer_stats": question_data["answer_stats"],
                "session_stats": question_data["session_stats"],
                "metadata": rc_data["metadata"]
            }
            
            # Save result - use the format rc_[number]_[question_number].json
            output_file = os.path.join(OUTPUT_DIR, f"rc_{rc_number}_{question_number}.json")
            save_result(output_file, result)
            print(f"Saved processed result to {output_file}")
            
            # Calculate processing time
            processing_time = time.time() - start_time
            print(f"Processing time for RC {rc_number} Question {question_number}: {processing_time:.2f} seconds")
            
            results.append({
                "status": "processed", 
                "rc_number": rc_number,
                "question_number": question_number,
                "question_id": question_id,
                "processing_time": processing_time
            })
            
            # Add a small delay between questions to avoid overloading the system
            if question_number < len(rc_data["questions"]):  # Don't delay after the last question
                delay = random.uniform(MIN_REQUEST_DELAY, MAX_REQUEST_DELAY)
                print(f"Waiting {delay:.2f} seconds before next question...")
                time.sleep(delay)
        
        except Exception as e:
            processing_time = time.time() - start_time
            print(f"Processing time for RC {rc_number} Question {question_number} (error): {processing_time:.2f} seconds")
            print(f"Error processing RC {rc_number} Question {question_number}: {str(e)}")
            with open(ERROR_LOG_FILE, 'a', encoding='utf-8') as f:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                f.write(f"{timestamp} - RC {rc_number} Question {question_number}: {str(e)}\n")
            results.append({
                "status": "error", 
                "rc_number": rc_number,
                "question_number": question_number,
                "question_id": question_id,
                "processing_time": processing_time
            })
    
    return results

def process_file_sequentially(html_file, processed_files, processed_questions):
    """Process a single RC HTML file and all its questions sequentially"""
    file_name = os.path.basename(html_file)
    
    # Check if already processed completely
    if file_name in processed_files:
        print(f"Skipping already processed file: {file_name}")
        return {
            "status": "skipped", 
            "file_name": file_name,
            "processing_time": 0,
            "question_results": []
        }
    
    print(f"\nProcessing file: {file_name}")
    start_time = time.time()
    
    try:
        # Load and parse HTML file
        rc_data = load_html_file(html_file)
        
        # Process all questions in this RC passage
        question_results = process_rc_questions_sequentially(rc_data, processed_questions)
        
        # Calculate total processing time
        processing_time = time.time() - start_time
        print(f"Total processing time for {file_name}: {processing_time:.2f} seconds")
        
        return {
            "status": "processed", 
            "file_name": file_name,
            "processing_time": processing_time,
            "question_results": question_results
        }
    
    except Exception as e:
        processing_time = time.time() - start_time
        print(f"Processing time for {file_name} (error): {processing_time:.2f} seconds")
        print(f"Error processing file {file_name}: {str(e)}")
        with open(ERROR_LOG_FILE, 'a', encoding='utf-8') as f:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"{timestamp} - {file_name}: {str(e)}\n")
        return {
            "status": "error", 
            "file_name": file_name,
            "processing_time": processing_time,
            "question_results": []
        }

def process_all_files_sequentially(start_idx=None, end_idx=None, limit=None, test_mode=False):
    """Process all RC HTML files in the directory sequentially (one at a time)"""
    # Get list of all HTML files
    html_files = sorted(glob.glob(os.path.join(HTML_DIR, "*.html")))
    print(f"Found {len(html_files)} RC HTML files to process")
    
    # Load checkpoint
    checkpoint = load_checkpoint()
    processed_files = checkpoint.get("processed_files", [])
    processed_questions = checkpoint.get("processed_questions", [])
    print(f"Found {len(processed_files)} already processed files in checkpoint")
    print(f"Found {len(processed_questions)} already processed questions in checkpoint")
    
    # Filter files based on parameters
    if start_idx is not None and end_idx is not None:
        html_files = html_files[start_idx:end_idx+1]
        print(f"Processing files from index {start_idx} to {end_idx} ({len(html_files)} files)")
    elif start_idx is not None:
        html_files = html_files[start_idx:]
        print(f"Processing files from index {start_idx} onwards ({len(html_files)} files)")
    elif limit is not None:
        html_files = html_files[:limit]
        print(f"Processing first {limit} files")
    elif test_mode:
        html_files = html_files[:TEST_MODE_LIMIT]
        print(f"TEST MODE: Processing first {TEST_MODE_LIMIT} files")
    
    # Process files one by one
    num_files_processed = 0
    num_files_skipped = 0
    num_files_errors = 0
    num_questions_processed = 0
    num_questions_skipped = 0
    num_questions_errors = 0
    total_processing_time = 0
    processing_times = []
    
    for i, html_file in enumerate(html_files):
        print(f"Processing file {i+1}/{len(html_files)}")
        result = process_file_sequentially(html_file, processed_files, processed_questions)
        
        if result["status"] == "processed":
            num_files_processed += 1
            file_name = result["file_name"]
            
            # Add to processed files only if all questions were successfully processed
            if not any(q["status"] == "error" for q in result["question_results"]):
                processed_files.append(file_name)
            
            # Update question processing stats
            for q_result in result["question_results"]:
                if q_result["status"] == "processed":
                    num_questions_processed += 1
                    processed_questions.append(q_result["question_id"])
                elif q_result["status"] == "error":
                    num_questions_errors += 1
                elif q_result["status"] == "skipped":
                    num_questions_skipped += 1
            
            # Save checkpoint after each file
            save_checkpoint(processed_files, processed_questions)
            
            # Track processing time
            if result["processing_time"] > 0:
                total_processing_time += result["processing_time"]
                processing_times.append(result["processing_time"])
        elif result["status"] == "error":
            num_files_errors += 1
        elif result["status"] == "skipped":
            num_files_skipped += 1
        
        # Add a small delay between files to avoid overloading the system
        if i < len(html_files) - 1:  # Don't delay after the last file
            delay = random.uniform(MIN_REQUEST_DELAY, MAX_REQUEST_DELAY)
            print(f"Waiting {delay:.2f} seconds before next file...")
            time.sleep(delay)
    
    print(f"\nProcessing complete!")
    print(f"Files processed: {num_files_processed}")
    print(f"Files skipped: {num_files_skipped}")
    print(f"Files with errors: {num_files_errors}")
    print(f"Total files considered: {len(html_files)}")
    print(f"\nQuestions processed: {num_questions_processed}")
    print(f"Questions skipped: {num_questions_skipped}")
    print(f"Questions with errors: {num_questions_errors}")
    
    # Print timing statistics
    if processing_times:
        avg_time = total_processing_time / len(processing_times)
        min_time = min(processing_times) if processing_times else 0
        max_time = max(processing_times) if processing_times else 0
        print(f"\nTiming Statistics:")
        print(f"Average processing time: {avg_time:.2f} seconds per RC file")
        print(f"Fastest processing time: {min_time:.2f} seconds")
        print(f"Slowest processing time: {max_time:.2f} seconds")
        print(f"Total processing time: {total_processing_time:.2f} seconds")

if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Process RC Exam Packs HTML files with direct extraction.')
    parser.add_argument('--start', type=int, help='Starting index (0-based) of files to process')
    parser.add_argument('--end', type=int, help='Ending index (0-based) of files to process')
    parser.add_argument('--limit', type=int, help='Limit number of files to process')
    parser.add_argument('--test', action='store_true', help='Run in test mode with limited files')
    
    args = parser.parse_args()
    
    # Process files
    process_all_files_sequentially(
        start_idx=args.start,
        end_idx=args.end,
        limit=args.limit,
        test_mode=args.test
    ) 