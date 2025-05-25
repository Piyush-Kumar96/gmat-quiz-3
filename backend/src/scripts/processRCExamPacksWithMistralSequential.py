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
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/processed_rc_exampacks_mistral7b_sequential_v2')
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "mistral:7b"  # Using the Mistral 7B model
CHECKPOINT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/mistral_rc_exampacks_sequential_v2_checkpoint.json')
ERROR_LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/mistral_rc_exampacks_sequential_v2_errors.log')
BATCH_SIZE = 10  # Process in batches for checkpoint frequency
MAX_RETRIES = 3  # Maximum retries for API calls
RETRY_DELAY = 3  # Delay between retries in seconds
MIN_REQUEST_DELAY = 0.2  # Minimum delay between requests
MAX_REQUEST_DELAY = 0.8  # Maximum delay between requests
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
    
    # Extract RC passage
    passage_div = soup.select_one('.reading.passage')
    if not passage_div:
        # Try alternative selector
        passage_div = soup.select_one('.reading-passage')
    
    passage_text = passage_div.get_text(separator=' ', strip=True) if passage_div else ""
    print(f"Extracted passage of length {len(passage_text)} characters")
    
    # Count how many timer placeholders exist to determine question count
    timer_placeholders = soup.find_all(id=re.compile(r'rc_timer_placeholder_\d+'))
    num_questions = len(timer_placeholders)
    
    if num_questions == 0:
        # Fallback: try to count questions by looking for question sections
        questions_sections = soup.select('.question')
        num_questions = len(questions_sections)
    
    # Extract all answer statistics divs
    answer_stats_divs = soup.select('.statisticWrapExisting')
    
    # Extract questions
    questions = []
    
    # Find all question sections
    question_sections = []
    
    # Method 1: Find questions by looking for sections with .question class
    question_divs = soup.select('.question')
    if question_divs:
        question_sections = question_divs
    else:
        # Method 2: Try to locate question sections by timer placeholders
        for i in range(1, num_questions + 1):
            timer_id = f'rc_timer_placeholder_{i}'
            timer_div = soup.find(id=timer_id)
            if timer_div:
                # Find the parent container that holds the question
                question_section = timer_div.find_parent('div', class_='question-container')
                if question_section:
                    question_sections.append(question_section)
    
    # Process each question section
    for idx, question_section in enumerate(question_sections):
        question_number = idx + 1  # 1-indexed question number
        
        # Extract question text
        question_text = ""
        question_text_div = question_section.select_one('.question-text')
        if question_text_div:
            question_text = question_text_div.get_text(separator=' ', strip=True)
        
        # If no specific question text div, try to find the question directly
        if not question_text:
            # Try to find the question after the timer placeholder
            timer_id = f'rc_timer_placeholder_{question_number}'
            timer_div = soup.find(id=timer_id)
            if timer_div:
                # Get next siblings until we find the actual question text
                next_element = timer_div.next_sibling
                question_parts = []
                while next_element:
                    if isinstance(next_element, str) and next_element.strip():
                        question_parts.append(next_element.strip())
                    elif hasattr(next_element, 'name'):
                        if next_element.name == 'div' and 'rc_timer_placeholder' in next_element.get('id', ''):
                            break
                        text = next_element.get_text(strip=True)
                        if text:
                            question_parts.append(text)
                    next_element = next_element.next_sibling
                
                if question_parts:
                    # Join all parts and try to extract just the question
                    full_text = ' '.join(question_parts)
                    # Try to extract the numbered question
                    question_match = re.search(r'^\d+\.\s+(.*?)(?=\s*\(A\)|\s*$)', full_text)
                    if question_match:
                        question_text = question_match.group(1).strip()
                    else:
                        # Otherwise, use the text up to the first option
                        question_text = re.sub(r'\s*\([A-E]\).*', '', full_text).strip()
        
        # Clean up the question text - remove spoiler text if present
        question_text = re.sub(r'^Show\s+Spoiler[A-E]?\s*', '', question_text)
        # Remove the question number prefix if present
        question_text = re.sub(r'^\d+\.\s+', '', question_text).strip()
        
        # Extract options
        options = {}
        options_div = question_section.select_one('.options')
        if options_div:
            for option_div in options_div.select('.option'):
                option_letter = option_div.select_one('.option-letter')
                option_text = option_div.select_one('.option-text')
                if option_letter and option_text:
                    letter = option_letter.get_text(strip=True).replace('.', '')
                    options[letter] = option_text.get_text(strip=True)
        
        # If no options found via selector, try to extract from text
        if not options:
            # Look for options in the format (A) Option text, (B) Option text, etc.
            question_section_text = question_section.get_text(strip=True)
            option_pattern = r'\(([A-E])\)\s*(.*?)(?=\s*\([A-E]\)|\s*$)'
            option_matches = re.findall(option_pattern, question_section_text)
            for letter, text in option_matches:
                options[letter] = text.strip()
        
        # Extract correct answer
        correct_answer = ""
        answer_div = question_section.select_one('.answer')
        if answer_div:
            correct_answer_span = answer_div.select_one('.correct-answer')
            if correct_answer_span:
                correct_answer = correct_answer_span.get_text(strip=True).replace('Correct Answer: ', '')
        
        # If no correct answer found, try to find it in spoiler
        if not correct_answer:
            spoiler_div = question_section.select_one('.spoiler .spoiler-hidden')
            if spoiler_div:
                correct_answer = spoiler_div.get_text(strip=True)
        
        # Extract answer statistics for this question
        answer_stats = {}
        if idx < len(answer_stats_divs):
            answer_stats_div = answer_stats_divs[idx]
            stats = answer_stats_div.select('.answerType, .answerPercentage')
            for i in range(0, len(stats), 2):
                if i + 1 < len(stats):
                    answer_type = stats[i].get_text(strip=True)
                    answer_percentage = stats[i+1].get_text(strip=True)
                    answer_stats[answer_type.lower()] = answer_percentage
        
        # Extract session statistics
        session_stats = {}
        session_div = question_section.select_one('.session-stats')
        if session_div:
            # Extract difficulty
            difficulty_div = session_div.select_one('.difficulty')
            if difficulty_div:
                session_stats['difficulty'] = difficulty_div.get_text(strip=True)
            
            # Extract correct percentage and time
            green_stats = session_div.select_one('.green')
            if green_stats:
                correct_percentage = green_stats.select_one('b')
                correct_time = green_stats.select_one('small')
                if correct_percentage:
                    session_stats['correct_percentage'] = correct_percentage.get_text(strip=True)
                if correct_time:
                    session_stats['correct_time'] = correct_time.get_text(strip=True)
            
            # Extract wrong percentage and time
            red_stats = session_div.select_one('.red')
            if red_stats:
                wrong_percentage = red_stats.select_one('b')
                wrong_time = red_stats.select_one('small')
                if wrong_percentage:
                    session_stats['wrong_percentage'] = wrong_percentage.get_text(strip=True)
                if wrong_time:
                    session_stats['wrong_time'] = wrong_time.get_text(strip=True)
            
            # Extract sessions count
            sessions_count = session_div.select_one('.black b')
            if sessions_count:
                session_stats['sessions_count'] = sessions_count.get_text(strip=True)
        
        # Get the HTML content for this question
        html_content = str(question_section)
        
        # Append to questions list
        questions.append({
            "rc_number": rc_number,
            "question_number": question_number,
            "question_text": question_text,
            "options": options,
            "correct_answer": correct_answer,
            "answer_stats": answer_stats,
            "session_stats": session_stats,
            "html_content": html_content
        })
    
    return {
        "rc_number": rc_number,
        "source_url": source_url,
        "passage_text": passage_text,
        "metadata": metadata,
        "questions": questions
    }

def extract_text_from_html(html_content):
    """Extract plain text from HTML content"""
    soup = BeautifulSoup(html_content, 'html.parser')
    return soup.get_text(separator=' ', strip=True)

def generate_response_for_question(rc_data, question_data, retry_count=0):
    """Generate response using Ollama API with Mistral 7B specially designed for RC questions"""
    # Extract plain text to help the model
    plain_text = extract_text_from_html(question_data["html_content"])
    
    # Create prompt for the model specifically for RC questions
    prompt = f"""
You are an expert GMAT tutor. I will give you a GMAT Reading Comprehension (RC) passage and a question with multiple choice options. Your task is to ACCURATELY EXTRACT (not reformulate) the components of the question:

1. VERBATIM EXTRACTION: Extract the exact question text as it appears.
2. VERBATIM EXTRACTION: Extract all answer choices (A-E) exactly as they appear. DO NOT change, rephrase or rewrite the options in any way!
3. Determine the correct answer for the question based on the passage.
4. Identify the specific RC question type (main idea, detail, inference, etc.)
5. Provide your explanation of why the correct answer is correct.

Here is the GMAT Reading Comprehension passage:
{rc_data["passage_text"]}

Here is question #{question_data["question_number"]} for this passage:
{question_data["question_text"]}

Options:
A: {question_data["options"].get("A", "")}
B: {question_data["options"].get("B", "")}
C: {question_data["options"].get("C", "")}
D: {question_data["options"].get("D", "")}
E: {question_data["options"].get("E", "")}

IMPORTANT: Format your response ONLY as a valid JSON object with this exact structure:
{{
  "question_text": "THE EXACT ORIGINAL TEXT of the question being asked - do not modify or rephrase",
  "options": {{
    "A": "THE EXACT ORIGINAL TEXT of option A - copy and paste the text I gave you above",
    "B": "THE EXACT ORIGINAL TEXT of option B - copy and paste the text I gave you above",
    "C": "THE EXACT ORIGINAL TEXT of option C - copy and paste the text I gave you above",
    "D": "THE EXACT ORIGINAL TEXT of option D - copy and paste the text I gave you above",
    "E": "THE EXACT ORIGINAL TEXT of option E - copy and paste the text I gave you above"
  }},
  "correct_answer": "The letter of the correct answer (A, B, C, D, or E)",
  "explanation": "Your explanation for why this answer is correct based on the passage",
  "question_type": "Reading Comprehension",
  "rc_specific_type": "Main Idea/Detail/Inference/etc."
}}

CRITICAL: DO NOT REPLACE, REPHRASE, OR REGENERATE the question text or options. Copy them EXACTLY as they appear in the prompt above. Copy and paste the text rather than rewriting or rewording it.
"""

    # Send request to Ollama API with retry logic
    try:
        print(f"Sending API request to Ollama for RC {rc_data['rc_number']} question {question_data['question_number']}...")
        timeout = 60  # Reduced timeout for faster processing
        
        response = requests.post(
            OLLAMA_API_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.05,  # Reduced temperature for more deterministic outputs
                    "top_p": 0.95,
                    "num_predict": 1500  # Reduced token limit for faster processing
                }
            },
            timeout=timeout
        )
        
        response.raise_for_status()
        result = response.json()
        
        # Extract the response text
        response_text = result.get("response", "")
        
        # Try to extract JSON from the response
        try:
            # Find the first { and the last }
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}') + 1
            
            if start_idx >= 0 and end_idx > start_idx:
                json_str = response_text[start_idx:end_idx]
                
                # Try to parse the JSON
                try:
                    parsed_json = json.loads(json_str)
                    
                    # Add the original passage text
                    parsed_json["passage_text"] = rc_data["passage_text"]
                    
                    # Add RC number and question number
                    parsed_json["rc_number"] = rc_data["rc_number"]
                    parsed_json["question_number"] = question_data["question_number"]
                    
                    # Add the original stats if they're missing in the response
                    parsed_json["answer_stats"] = question_data["answer_stats"]
                    parsed_json["session_stats"] = question_data["session_stats"]
                    
                    # Create metadata from original and add RC specific type
                    metadata = rc_data["metadata"].copy()
                    if "rc_specific_type" in parsed_json:
                        metadata["rc_specific_type"] = parsed_json.pop("rc_specific_type")
                    parsed_json["metadata"] = metadata
                    
                    # Ensure question_type is "Reading Comprehension"
                    parsed_json["question_type"] = "Reading Comprehension"
                    
                    # Validate the structure
                    required_keys = ["question_text", "options", "correct_answer", "explanation", "question_type"]
                    missing_keys = [key for key in required_keys if key not in parsed_json]
                    
                    if missing_keys:
                        # If keys are missing, try to manually extract them
                        return manually_extract_components(response_text, rc_data, question_data)
                    
                    return parsed_json
                except json.JSONDecodeError:
                    print(f"Error parsing JSON for RC {rc_data['rc_number']} question {question_data['question_number']}. Attempting manual extraction...")
                    return manually_extract_components(response_text, rc_data, question_data)
            else:
                print(f"Couldn't find valid JSON delimiters in response for RC {rc_data['rc_number']} question {question_data['question_number']}. Attempting manual extraction...")
                return manually_extract_components(response_text, rc_data, question_data)
        except Exception as e:
            print(f"Error processing response text: {str(e)}")
            if retry_count < MAX_RETRIES:
                print(f"Retrying ({retry_count + 1}/{MAX_RETRIES}) after {RETRY_DELAY} seconds...")
                time.sleep(RETRY_DELAY)
                return generate_response_for_question(rc_data, question_data, retry_count + 1)
            else:
                return {"error": f"Failed to extract valid JSON after {MAX_RETRIES} retries"}
    
    except requests.exceptions.RequestException as e:
        print(f"API request error: {str(e)}")
        if retry_count < MAX_RETRIES:
            # Exponential backoff with jitter
            delay = RETRY_DELAY * (2 ** retry_count) + random.uniform(0, 1)
            print(f"Retrying ({retry_count + 1}/{MAX_RETRIES}) after {delay:.2f} seconds...")
            time.sleep(delay)
            return generate_response_for_question(rc_data, question_data, retry_count + 1)
        else:
            return {"error": f"API request failed after {MAX_RETRIES} retries: {str(e)}"}

def manually_extract_components(text, rc_data, question_data):
    """Attempt to manually extract components from the response text for RC questions"""
    print(f"Manually extracting components for RC {rc_data['rc_number']} question {question_data['question_number']}...")
    
    # Create a basic structure
    result = {
        "passage_text": rc_data["passage_text"],
        "rc_number": rc_data["rc_number"],
        "question_number": question_data["question_number"],
        "question_text": question_data["question_text"],
        "options": question_data["options"].copy(),
        "correct_answer": question_data["correct_answer"],
        "explanation": "",
        "question_type": "Reading Comprehension",
        "metadata": rc_data["metadata"].copy(),
        "answer_stats": question_data["answer_stats"],
        "session_stats": question_data["session_stats"],
        "extraction_note": "This response was manually extracted from an improperly formatted model output."
    }
    
    # Look for question text section
    question_start = text.find('"question_text"')
    if question_start >= 0:
        question_value_start = text.find(':', question_start) + 1
        question_value_end = text.find('",', question_value_start)
        if question_value_end >= 0:
            result["question_text"] = text[question_value_start:question_value_end].strip().strip('"').strip()
    
    # Look for options (more complex)
    options_start = text.find('"options"')
    if options_start >= 0:
        options_section = text[options_start:text.find('}', options_start) + 1]
        
        # Try to extract each option
        for option in "ABCDE":
            option_key = f'"{option}"'
            option_start = options_section.find(option_key)
            if option_start >= 0:
                option_value_start = options_section.find(':', option_start) + 1
                option_value_end = options_section.find('",', option_value_start)
                if option_value_end >= 0:
                    result["options"][option] = options_section[option_value_start:option_value_end].strip().strip('"').strip()
    
    # Look for correct answer
    correct_start = text.find('"correct_answer"')
    if correct_start >= 0:
        correct_value_start = text.find(':', correct_start) + 1
        correct_value_end = text.find('",', correct_value_start)
        if correct_value_end >= 0:
            result["correct_answer"] = text[correct_value_start:correct_value_end].strip().strip('"').strip()
    
    # Look for explanation
    explanation_start = text.find('"explanation"')
    if explanation_start >= 0:
        explanation_value_start = text.find(':', explanation_start) + 1
        explanation_value_end = text.find('",', explanation_value_start)
        if explanation_value_end >= 0:
            result["explanation"] = text[explanation_value_start:explanation_value_end].strip().strip('"').strip()
    
    # Look for RC specific type
    type_start = text.find('"rc_specific_type"')
    if type_start >= 0:
        type_value_start = text.find(':', type_start) + 1
        type_value_end = text.find('",', type_value_start)
        if type_value_end >= 0:
            result["metadata"]["rc_specific_type"] = text[type_value_start:type_value_end].strip().strip('"').strip()
    
    return result

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
            # Generate response for this question
            result = generate_response_for_question(rc_data, question_data)
            
            # Check for errors
            if "error" in result:
                print(f"Error processing RC {rc_number} Question {question_number}: {result['error']}")
                with open(ERROR_LOG_FILE, 'a', encoding='utf-8') as f:
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    f.write(f"{timestamp} - RC {rc_number} Question {question_number}: {result['error']}\n")
                processing_time = time.time() - start_time
                print(f"Processing time for RC {rc_number} Question {question_number} (error): {processing_time:.2f} seconds")
                results.append({
                    "status": "error", 
                    "rc_number": rc_number,
                    "question_number": question_number,
                    "question_id": question_id,
                    "processing_time": processing_time
                })
                continue
            
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
            
            # Add a small delay between questions to avoid overloading the API
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
        
        # Add a small delay between files to avoid overloading the API
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
    parser = argparse.ArgumentParser(description='Process RC Exam Packs HTML files with Mistral 7B sequentially.')
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