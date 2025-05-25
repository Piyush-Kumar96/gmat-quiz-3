#!/usr/bin/env python3
import os
import json
import glob
import requests
import time
import random
import argparse
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

# Constants for CR OG Questions - Sequential Version
HTML_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/html_cr_ogquestions')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/processed_cr_ogquestions_mistral7b_sequential')
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "mistral:7b"  # Using the Mistral 7B model
CHECKPOINT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/mistral_cr_ogquestions_sequential_checkpoint.json')
ERROR_LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/mistral_cr_ogquestions_sequential_errors.log')
BATCH_SIZE = 10  # Process in batches for checkpoint frequency
MAX_RETRIES = 3  # Maximum retries for API calls
RETRY_DELAY = 3  # Delay between retries in seconds
MIN_REQUEST_DELAY = 0.2  # Minimum delay between requests
MAX_REQUEST_DELAY = 0.8  # Maximum delay between requests
TEST_MODE_LIMIT = 3  # Limit to 3 questions for initial testing

# Create output directory if it doesn't exist
os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_html_file(file_path):
    """Load and parse HTML file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Parse HTML
    soup = BeautifulSoup(content, 'html.parser')
    
    # Extract question number from filename
    question_number = os.path.basename(file_path).replace('cr_', '').replace('.html', '')
    
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
    
    # Extract question content (question text)
    question_text_div = soup.select_one('.question-text')
    question_text = question_text_div.get_text(separator=' ', strip=True) if question_text_div else ""
    
    # Extract answer statistics
    answer_stats = {}
    answer_stats_div = soup.select_one('.answer-stats')
    if answer_stats_div:
        for stat_wrap in answer_stats_div.select('.statisticWrapExisting'):
            answer_type = stat_wrap.select_one('.answerType')
            answer_percentage = stat_wrap.select_one('.answerPercentage')
            if answer_type and answer_percentage:
                answer_stats[answer_type.text.strip()] = answer_percentage.text.strip()
    
    # Extract session statistics
    session_stats = {}
    session_stats_div = soup.select_one('.session-stats')
    if session_stats_div:
        # Extract difficulty
        difficulty_div = session_stats_div.select_one('.difficulty')
        if difficulty_div:
            difficulty_text = difficulty_div.get_text(separator=' ', strip=True)
            session_stats['difficulty'] = difficulty_text
        
        # Extract question stats
        question_div = session_stats_div.select_one('.question')
        if question_div:
            # Extract correct percentage
            green_b = question_div.select_one('b.green')
            if green_b:
                session_stats['correct_percentage'] = green_b.text.strip()
            
            # Extract correct time
            correct_time = question_div.select_one('b.green + small')
            if correct_time:
                session_stats['correct_time'] = correct_time.text.strip()
            
            # Extract wrong percentage
            red_b = question_div.select_one('span.red b')
            if red_b:
                session_stats['wrong_percentage'] = red_b.text.strip()
            
            # Extract wrong time
            wrong_time = question_div.select_one('small.red')
            if wrong_time:
                session_stats['wrong_time'] = wrong_time.text.strip()
            
            # Extract sessions count
            black_span = question_div.select_one('span.black')
            if black_span:
                session_count = black_span.select_one('b')
                if session_count:
                    session_stats['sessions_count'] = session_count.text.strip()
    
    # Get the HTML content
    html_content = str(soup.select_one('.question-container'))
    
    return {
        "question_number": question_number,
        "source_url": source_url,
        "question_text": question_text,
        "answer_stats": answer_stats,
        "session_stats": session_stats,
        "metadata": metadata,
        "html_content": html_content
    }

def extract_text_from_html(html_content):
    """Extract plain text from HTML content"""
    soup = BeautifulSoup(html_content, 'html.parser')
    return soup.get_text(separator=' ', strip=True)

def generate_response(question_data, retry_count=0):
    """Generate response using Ollama API with Mistral 7B specially designed for CR questions"""
    # Extract plain text to help the model
    plain_text = extract_text_from_html(question_data["html_content"])
    
    # Create prompt for the model specifically for CR questions
    prompt = f"""
You are an expert GMAT tutor. I will give you a GMAT Critical Reasoning (CR) question with multiple choice options. Your task is to ACCURATELY EXTRACT (not reformulate) the components of the question:

1. VERBATIM EXTRACTION: Extract the exact argument/stimulus text as it appears in the original question. Do not reformulate, rephrase, or summarize.
2. VERBATIM EXTRACTION: Extract the exact question stem as it appears.
3. VERBATIM EXTRACTION: Extract all answer choices (A-E) exactly as they appear.
4. Determine the correct answer for the question based on CR principles.
5. Identify the specific CR question type (assumption, strengthen, weaken, inference, etc.)
6. Provide your explanation of why the correct answer is correct.

Here is the GMAT Critical Reasoning question:
{question_data["question_text"]}

IMPORTANT: Format your response ONLY as a valid JSON object with this exact structure:
{{
  "argument": "THE EXACT ORIGINAL TEXT of the argument/stimulus as it appears in the question - do not modify or rephrase",
  "question_stem": "THE EXACT ORIGINAL TEXT of the question being asked - do not modify or rephrase",
  "options": {{
    "A": "THE EXACT ORIGINAL TEXT of option A - do not modify",
    "B": "THE EXACT ORIGINAL TEXT of option B - do not modify",
    "C": "THE EXACT ORIGINAL TEXT of option C - do not modify",
    "D": "THE EXACT ORIGINAL TEXT of option D - do not modify",
    "E": "THE EXACT ORIGINAL TEXT of option E - do not modify"
  }},
  "correct_answer": "The letter of the correct answer (A, B, C, D, or E)",
  "explanation": "Your explanation for why this answer is correct",
  "question_type": "Critical Reasoning",
  "cr_specific_type": "Assumption/Strengthen/Weaken/etc."
}}

I NEED THE EXACT ORIGINAL TEXT for the argument, question stem, and options - not your rephrased or reformulated versions. Use copy-paste, not rewording.
"""

    # Send request to Ollama API with retry logic
    try:
        print(f"Sending API request to Ollama for question {question_data['question_number']}...")
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
                    
                    # Add the original stats and metadata if they're missing in the response
                    if "answer_stats" not in parsed_json:
                        parsed_json["answer_stats"] = question_data["answer_stats"]
                    if "session_stats" not in parsed_json:
                        parsed_json["session_stats"] = question_data["session_stats"]
                    
                    # Create metadata from original and add CR specific type
                    metadata = question_data["metadata"].copy()
                    if "cr_specific_type" in parsed_json:
                        metadata["cr_specific_type"] = parsed_json.pop("cr_specific_type")
                    parsed_json["metadata"] = metadata
                    
                    # Ensure question_type is "Critical Reasoning"
                    parsed_json["question_type"] = "Critical Reasoning"
                    
                    # Validate the structure
                    required_keys = ["argument", "question_stem", "options", "correct_answer", "explanation", "question_type"]
                    missing_keys = [key for key in required_keys if key not in parsed_json]
                    
                    if missing_keys:
                        # If keys are missing, try to manually extract them
                        return manually_extract_components(response_text, question_data)
                    
                    return parsed_json
                except json.JSONDecodeError:
                    print(f"Error parsing JSON for question {question_data['question_number']}. Attempting manual extraction...")
                    return manually_extract_components(response_text, question_data)
            else:
                print(f"Couldn't find valid JSON delimiters in response for question {question_data['question_number']}. Attempting manual extraction...")
                return manually_extract_components(response_text, question_data)
        except Exception as e:
            print(f"Error processing response text: {str(e)}")
            if retry_count < MAX_RETRIES:
                print(f"Retrying ({retry_count + 1}/{MAX_RETRIES}) after {RETRY_DELAY} seconds...")
                time.sleep(RETRY_DELAY)
                return generate_response(question_data, retry_count + 1)
            else:
                return {"error": f"Failed to extract valid JSON after {MAX_RETRIES} retries"}
    
    except requests.exceptions.RequestException as e:
        print(f"API request error: {str(e)}")
        if retry_count < MAX_RETRIES:
            # Exponential backoff with jitter
            delay = RETRY_DELAY * (2 ** retry_count) + random.uniform(0, 1)
            print(f"Retrying ({retry_count + 1}/{MAX_RETRIES}) after {delay:.2f} seconds...")
            time.sleep(delay)
            return generate_response(question_data, retry_count + 1)
        else:
            return {"error": f"API request failed after {MAX_RETRIES} retries: {str(e)}"}

def manually_extract_components(text, question_data):
    """Attempt to manually extract components from the response text"""
    print(f"Manually extracting components for question {question_data['question_number']}...")
    
    # Create a basic structure
    result = {
        "argument": "",
        "question_stem": "",
        "options": {
            "A": "",
            "B": "",
            "C": "",
            "D": "",
            "E": ""
        },
        "correct_answer": "",
        "explanation": "",
        "question_type": "Critical Reasoning",
        "metadata": question_data["metadata"].copy(),
        "answer_stats": question_data["answer_stats"],
        "session_stats": question_data["session_stats"],
        "extraction_note": "This response was manually extracted from an improperly formatted model output."
    }
    
    # Look for argument section
    arg_start = text.find('"argument"')
    if arg_start >= 0:
        arg_value_start = text.find(':', arg_start) + 1
        arg_value_end = text.find('",', arg_value_start)
        if arg_value_end >= 0:
            result["argument"] = text[arg_value_start:arg_value_end].strip().strip('"').strip()
    
    # Look for question stem
    stem_start = text.find('"question_stem"')
    if stem_start >= 0:
        stem_value_start = text.find(':', stem_start) + 1
        stem_value_end = text.find('",', stem_value_start)
        if stem_value_end >= 0:
            result["question_stem"] = text[stem_value_start:stem_value_end].strip().strip('"').strip()
    
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
    
    # Look for CR specific type
    type_start = text.find('"cr_specific_type"')
    if type_start >= 0:
        type_value_start = text.find(':', type_start) + 1
        type_value_end = text.find('",', type_value_start)
        if type_value_end >= 0:
            result["metadata"]["cr_specific_type"] = text[type_value_start:type_value_end].strip().strip('"').strip()
    
    return result

def save_result(file_path, result):
    """Save result to a JSON file"""
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

def load_checkpoint():
    """Load checkpoint file if it exists"""
    try:
        if os.path.exists(CHECKPOINT_FILE):
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"processed_files": []}
    except Exception as e:
        print(f"Error loading checkpoint: {str(e)}")
        return {"processed_files": []}

def save_checkpoint(processed_files):
    """Save checkpoint information"""
    try:
        with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
            json.dump({"processed_files": processed_files}, f, indent=2)
    except Exception as e:
        print(f"Error saving checkpoint: {str(e)}")

def process_file_sequentially(html_file, processed_files):
    """Process a single file and return results"""
    file_name = os.path.basename(html_file)
    
    # Check if already processed
    if file_name in processed_files:
        print(f"Skipping already processed file: {file_name}")
        return {
            "status": "skipped", 
            "file_name": file_name,
            "processing_time": 0
        }
    
    print(f"\nProcessing file: {file_name}")
    start_time = time.time()
    
    try:
        # Load and parse HTML file
        question_data = load_html_file(html_file)
        
        # Generate response
        result = generate_response(question_data)
        
        # Check for errors
        if "error" in result:
            print(f"Error processing file {file_name}: {result['error']}")
            with open(ERROR_LOG_FILE, 'a', encoding='utf-8') as f:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                f.write(f"{timestamp} - {file_name}: {result['error']}\n")
            processing_time = time.time() - start_time
            print(f"Processing time for {file_name} (error): {processing_time:.2f} seconds")
            return {
                "status": "error", 
                "file_name": file_name,
                "processing_time": processing_time
            }
        
        # Save result
        output_file = os.path.join(OUTPUT_DIR, f"processed_{file_name.replace('.html', '.json')}")
        save_result(output_file, result)
        print(f"Saved processed result to {output_file}")
        
        # Calculate processing time
        processing_time = time.time() - start_time
        print(f"Processing time for {file_name}: {processing_time:.2f} seconds")
        
        return {
            "status": "processed", 
            "file_name": file_name,
            "processing_time": processing_time
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
            "processing_time": processing_time
        }

def process_all_files_sequentially(start_idx=None, end_idx=None, limit=None, test_mode=False):
    """Process all HTML files in the directory sequentially (one at a time)"""
    # Get list of all HTML files
    html_files = sorted(glob.glob(os.path.join(HTML_DIR, "*.html")))
    print(f"Found {len(html_files)} HTML files to process")
    
    # Load checkpoint
    checkpoint = load_checkpoint()
    processed_files = checkpoint.get("processed_files", [])
    print(f"Found {len(processed_files)} already processed files in checkpoint")
    
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
    num_processed = 0
    num_skipped = 0
    num_errors = 0
    total_processing_time = 0
    processing_times = []
    
    for i, html_file in enumerate(html_files):
        print(f"Processing file {i+1}/{len(html_files)}")
        result = process_file_sequentially(html_file, processed_files)
        
        if result["status"] == "processed":
            num_processed += 1
            processed_files.append(result["file_name"])
            save_checkpoint(processed_files)
            
            # Track processing time
            if result["processing_time"] > 0:
                total_processing_time += result["processing_time"]
                processing_times.append(result["processing_time"])
        elif result["status"] == "error":
            num_errors += 1
        elif result["status"] == "skipped":
            num_skipped += 1
        
        # Add a small delay between files to avoid overloading the API
        if i < len(html_files) - 1:  # Don't delay after the last file
            delay = random.uniform(MIN_REQUEST_DELAY, MAX_REQUEST_DELAY)
            print(f"Waiting {delay:.2f} seconds before next file...")
            time.sleep(delay)
    
    print(f"\nProcessing complete!")
    print(f"Processed: {num_processed}")
    print(f"Skipped (already processed): {num_skipped}")
    print(f"Errors: {num_errors}")
    print(f"Total files considered: {len(html_files)}")
    
    # Print timing statistics
    if processing_times:
        avg_time = total_processing_time / len(processing_times)
        min_time = min(processing_times) if processing_times else 0
        max_time = max(processing_times) if processing_times else 0
        print(f"\nTiming Statistics:")
        print(f"Average processing time: {avg_time:.2f} seconds per question")
        print(f"Fastest processing time: {min_time:.2f} seconds")
        print(f"Slowest processing time: {max_time:.2f} seconds")
        print(f"Total processing time: {total_processing_time:.2f} seconds")

if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Process CR OG Questions HTML files with Mistral 7B sequentially.')
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