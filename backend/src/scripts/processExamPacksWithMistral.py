import os
import json
import glob
import requests
import time
import random
import argparse
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

# Constants - Modified for Exam Packs
HTML_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/html_specific_exampacks')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/processed_specific_exampacks_mistral7b')
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "mistral:7b"  # Using the Mistral 7B model
CHECKPOINT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/mistral_exampacks_checkpoint.json')
ERROR_LOG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/mistral_exampacks_errors.log')
BATCH_SIZE = 5  # Process in small batches
MAX_RETRIES = 3  # Maximum retries for API calls
RETRY_DELAY = 5  # Base delay for retries in seconds
MIN_REQUEST_DELAY = 0.5  # Minimum delay between requests
MAX_REQUEST_DELAY = 1.5  # Maximum delay between requests
TEST_MODE_LIMIT = 10  # Limit to 10 questions for initial testing

# Create output directory if it doesn't exist
os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_html_file(file_path):
    """Load and parse HTML file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Parse HTML
    soup = BeautifulSoup(content, 'html.parser')
    
    # Extract question number from filename
    question_number = os.path.basename(file_path).replace('question_', '').replace('.html', '')
    
    # Extract source URL
    source_url = soup.select_one('.source-url a')['href'] if soup.select_one('.source-url a') else ""
    
    # Extract metadata
    metadata = {
        'source': '',
        'type': '',
        'difficulty_level': '',
        'topic': ''
    }
    
    metadata_div = soup.select_one('.metadata')
    if metadata_div:
        source_div = metadata_div.select_one('div:nth-child(1)')
        if source_div:
            metadata['source'] = source_div.get_text().replace('Source:', '').strip()
            
        type_div = metadata_div.select_one('div:nth-child(2)')
        if type_div:
            metadata['type'] = type_div.get_text().replace('Type:', '').strip()
            
        difficulty_div = metadata_div.select_one('div:nth-child(3)')
        if difficulty_div:
            metadata['difficulty_level'] = difficulty_div.get_text().replace('Difficulty Level:', '').strip()
            
        topic_div = metadata_div.select_one('div:nth-child(4)')
        if topic_div:
            metadata['topic'] = topic_div.get_text().replace('Topic:', '').strip()
    
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
    """Generate response using Ollama API with Mistral 7B"""
    # Extract plain text to help the model
    plain_text = extract_text_from_html(question_data["html_content"])
    
    # Create prompt for the model with enhanced DS question recognition
    prompt = f"""
You are an expert GMAT tutor. I will give you a GMAT question with multiple choice options and statistics. Your task is to:

1. CAREFULLY separate the question text from the answer options. The question text should NOT include any of the answer options.
2. Clean up the question text by removing any repetitions, fixing formatting issues, and ensuring it's logically coherent.
3. Make sure mathematical expressions are correctly formatted (e.g., x^2 for x squared, √x for square root of x).
4. The options typically start with patterns like "A.", "B.", "(A)", "(B)", etc. Make sure these are properly identified as options, not part of the question.
5. Determine if the question is Problem Solving (PS) or Data Sufficiency (DS):
   - Problem Solving: These require calculating a specific answer
   - Data Sufficiency: These ask if given statements are sufficient to answer a question
   
   For Data Sufficiency questions:
   - Identify them by looking for the words "sufficient", "determine", or statements labeled as (1) and (2)
   - Include both statements (1) and (2) in the question text
   - For Data Sufficiency questions ONLY, the answer options are strictly standardized as:
      A: "Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient."
      B: "Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient."
      C: "BOTH statements TOGETHER are sufficient, but NEITHER statement ALONE is sufficient."
      D: "EACH statement ALONE is sufficient."
      E: "Statements (1) and (2) TOGETHER are NOT sufficient."
   - Also do not include explanations or analysis in the option text itself.
   
   For Problem Solving questions, extract the actual answer choices from the text.

6. Determine the correct answer based on your mathematical expertise.
7. Provide a detailed step-by-step explanation of how to solve the problem.

Here is the GMAT question information:

Question Text (contains both the question and options mixed together):
{question_data["question_text"]}

Answer Statistics:
{json.dumps(question_data["answer_stats"], indent=2)}

Session Statistics:
{json.dumps(question_data["session_stats"], indent=2)}

Metadata (question type and topic):
{json.dumps(question_data["metadata"], indent=2)}

IMPORTANT: You MUST format your response as a valid JSON object with this exact structure:
{{
  "question": "ONLY the cleaned-up question text WITHOUT any answer options. Remove any repetitions and ensure the question is logically coherent. For Data Sufficiency questions, include both statement (1) and statement (2) in the question text. Do NOT use escape characters like \\n.",
  "options": {{
    "A": "For PS: actual option text. For DS: 'Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient.'",
    "B": "For PS: actual option text. For DS: 'Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient.'",
    "C": "For PS: actual option text. For DS: 'BOTH statements TOGETHER are sufficient, but NEITHER statement ALONE is sufficient.'",
    "D": "For PS: actual option text. For DS: 'EACH statement ALONE is sufficient.'",
    "E": "For PS: actual option text. For DS: 'Statements (1) and (2) TOGETHER are NOT sufficient.'"
  }},
  "question_type": "Problem Solving" or "Data Sufficiency",
  "correct_answer": "the letter of the correct answer (A, B, C, D, or E)",
  "explanation": "your step-by-step explanation",
  "answer_stats": {json.dumps(question_data["answer_stats"])},
  "session_stats": {json.dumps(question_data["session_stats"])}
}}

Remember, your entire response must be a valid JSON object with the structure shown above. Do not include any text before or after the JSON.
"""

    # Send request to Ollama API with retry logic
    try:
        print(f"Sending API request to Ollama for question {question_data['question_number']}...")
        timeout = 90  # 90 seconds timeout
        
        response = requests.post(
            OLLAMA_API_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "top_p": 0.9,
                    "num_predict": 2048
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
                    
                    # Add the original stats if they're missing in the response
                    if "answer_stats" not in parsed_json:
                        parsed_json["answer_stats"] = question_data["answer_stats"]
                    if "session_stats" not in parsed_json:
                        parsed_json["session_stats"] = question_data["session_stats"]
                    
                    # Ensure it has question_type field
                    if "question_type" not in parsed_json:
                        if "Data Sufficiency" in question_data.get("metadata", {}).get("type", ""):
                            parsed_json["question_type"] = "Data Sufficiency"
                        else:
                            parsed_json["question_type"] = "Problem Solving"
                    
                    # Enforce correct Data Sufficiency options, but ONLY for actual DS questions
                    if parsed_json.get("question_type") == "Data Sufficiency" or question_data.get("metadata", {}).get("type", "") == "DS":
                        parsed_json["options"] = {
                            "A": "Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient.",
                            "B": "Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient.",
                            "C": "BOTH statements TOGETHER are sufficient, but NEITHER statement ALONE is sufficient.",
                            "D": "EACH statement ALONE is sufficient.",
                            "E": "Statements (1) and (2) TOGETHER are NOT sufficient."
                        }
                    
                    # Validate the structure
                    required_keys = ["question", "options", "question_type", "correct_answer", "explanation"]
                    if all(key in parsed_json for key in required_keys):
                        return parsed_json
                    else:
                        missing_keys = [key for key in required_keys if key not in parsed_json]
                        return {
                            "error": f"Missing required keys in JSON: {missing_keys}",
                            "partial_json": parsed_json,
                            "raw_response": response_text
                        }
                except json.JSONDecodeError as e:
                    # If JSON parsing fails, try to manually extract the components
                    return {
                        "error": f"Invalid JSON format: {str(e)}",
                        "raw_response": response_text,
                        "extracted_text": manually_extract_components(response_text, question_data)
                    }
            else:
                return {"error": "Could not find JSON structure", "raw_response": response_text}
        except Exception as e:
            return {"error": f"Error processing response: {str(e)}", "raw_response": response_text}
            
    except requests.exceptions.RequestException as e:
        # Implement retry logic with exponential backoff
        if retry_count < MAX_RETRIES:
            # Calculate backoff delay
            backoff_delay = RETRY_DELAY * (2 ** retry_count) + random.uniform(0, 1)
            print(f"Question {question_data['question_number']}: API request failed: {str(e)}. Retrying in {backoff_delay:.2f} seconds... (Attempt {retry_count + 1}/{MAX_RETRIES})")
            
            # Log the error
            with open(ERROR_LOG_FILE, 'a') as f:
                f.write(f"[{datetime.now().isoformat()}] Question {question_data['question_number']}: API request failed: {str(e)}. Retrying...\n")
            
            # Wait before retrying
            time.sleep(backoff_delay)
            
            # Retry
            return generate_response(question_data, retry_count + 1)
        
        # If max retries reached, return error
        print(f"Question {question_data['question_number']}: Max retries reached. API request failed.")
        with open(ERROR_LOG_FILE, 'a') as f:
            f.write(f"[{datetime.now().isoformat()}] Question {question_data['question_number']}: Max retries reached. API request failed: {str(e)}\n")
        
        return {"error": f"API request failed after {MAX_RETRIES} retries: {str(e)}"}

def manually_extract_components(text, question_data):
    """Attempt to manually extract question components if JSON parsing fails"""
    result = {
        "answer_stats": question_data["answer_stats"],
        "session_stats": question_data["session_stats"]
    }
    
    # Try to extract question
    if "question:" in text.lower() or "question" in text.lower():
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if "question:" in line.lower() or "question" in line.lower():
                if i+1 < len(lines) and lines[i+1].strip():
                    result["question"] = lines[i+1].strip()
                    break
                else:
                    # Extract from the same line
                    parts = line.split(':', 1)
                    if len(parts) > 1:
                        result["question"] = parts[1].strip()
    
    # Determine if it's a Data Sufficiency question
    is_ds = False
    if "Data Sufficiency" in question_data.get("metadata", {}).get("type", "") or question_data.get("metadata", {}).get("type", "") == "DS":
        is_ds = True
        result["question_type"] = "Data Sufficiency"
    else:
        result["question_type"] = "Problem Solving"
    
    # Set options based on question type
    if is_ds:
        # Use standard DS options
        result["options"] = {
            "A": "Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient.",
            "B": "Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient.",
            "C": "BOTH statements TOGETHER are sufficient, but NEITHER statement ALONE is sufficient.",
            "D": "EACH statement ALONE is sufficient.",
            "E": "Statements (1) and (2) TOGETHER are NOT sufficient."
        }
    else:
        # Try to extract options
        options = {}
        option_markers = ["A:", "B:", "C:", "D:", "E:"]
        for marker in option_markers:
            if marker in text:
                parts = text.split(marker, 1)
                if len(parts) > 1:
                    option_text = parts[1].split('\n')[0].strip()
                    options[marker[0]] = option_text
        
        if options:
            result["options"] = options
    
    # Try to extract correct answer
    if "correct answer:" in text.lower() or "answer:" in text.lower():
        lines = text.split('\n')
        for line in lines:
            if "correct answer:" in line.lower() or "answer:" in line.lower():
                parts = line.split(':', 1)
                if len(parts) > 1:
                    answer = parts[1].strip()
                    # Extract just the letter
                    if answer and answer[0] in "ABCDE":
                        result["correct_answer"] = answer[0]
    
    # Try to extract explanation
    if "explanation:" in text.lower() or "solution:" in text.lower():
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if "explanation:" in line.lower() or "solution:" in line.lower():
                explanation_lines = []
                for j in range(i+1, len(lines)):
                    if any(marker in lines[j] for marker in ["question:", "options:", "correct answer:"]):
                        break
                    explanation_lines.append(lines[j])
                result["explanation"] = '\n'.join(explanation_lines).strip()
    
    return result

def save_result(file_path, result):
    """Save result to a file"""
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Saved result to {file_path}")

def read_checkpoint():
    """Read checkpoint file if it exists"""
    try:
        with open(CHECKPOINT_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"processed_files": []}

def save_checkpoint(processed_files):
    """Save checkpoint data"""
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump({"processed_files": processed_files}, f, indent=2)
    print(f"Checkpoint saved: {len(processed_files)} files processed")

def process_all_files(start_idx=None, end_idx=None, limit=None):
    """Process all HTML files in the directory with batching and checkpointing"""
    # Get all HTML files
    html_files = glob.glob(os.path.join(HTML_DIR, 'question_*.html'))
    total_files = len(html_files)
    
    print(f"Found {total_files} HTML files to process")
    
    # Read checkpoint to resume from where we left off
    checkpoint = read_checkpoint()
    processed_files = checkpoint.get("processed_files", [])
    
    print(f"Resuming from checkpoint: {len(processed_files)}/{total_files} files already processed")
    
    # Filter out already processed files
    remaining_files = [f for f in html_files if os.path.basename(f) not in processed_files]
    
    if not remaining_files:
        print("All files have already been processed!")
        return
    
    # Sort remaining files for consistent ordering
    remaining_files.sort()
    
    # Apply custom range if specified
    if start_idx is not None or end_idx is not None or limit is not None:
        start = start_idx or 0
        end = end_idx if end_idx is not None else len(remaining_files)
        
        # Apply limit if specified
        if limit is not None:
            end = min(start + limit, len(remaining_files))
        
        remaining_files = remaining_files[start:end]
        print(f"Applied custom range: processing files {start} to {end-1} (total: {len(remaining_files)})")
    
    # In test mode, limit to TEST_MODE_LIMIT questions
    # remaining_files = remaining_files[:TEST_MODE_LIMIT]
    # print(f"TESTING MODE: Limited to processing only {TEST_MODE_LIMIT} questions")
    
    print(f"Processing {len(remaining_files)} remaining files sequentially in batches of {BATCH_SIZE}")
    
    # Process files in batches
    all_results = []
    
    for i in range(0, len(remaining_files), BATCH_SIZE):
        batch = remaining_files[i:i+BATCH_SIZE]
        print(f"\nProcessing batch {i//BATCH_SIZE + 1}/{(len(remaining_files)-1)//BATCH_SIZE + 1} ({len(batch)} files)")
        
        batch_results = []
        batch_start_time = time.time()
        
        for file_index, file_path in enumerate(batch):
            file_name = os.path.basename(file_path)
            print(f"[{file_index+1}/{len(batch)}] Processing {file_name}...")
            
            try:
                start_time = time.time()
                
                # Load HTML file
                question_data = load_html_file(file_path)
                if not question_data:
                    print(f"Failed to load {file_path}")
                    continue
                
                # Generate response
                print(f"Sending request to Ollama for question {question_data['question_number']}...")
                response = generate_response(question_data)
                print(f"Received response for question {question_data['question_number']} in {time.time() - start_time:.2f}s")
                
                # Combine data
                result = {
                    "question_number": question_data["question_number"],
                    "source_url": question_data["source_url"],
                    "metadata": question_data["metadata"],
                    "analysis": response
                }
                
                # Save individual result immediately to avoid data loss
                output_file = os.path.join(OUTPUT_DIR, f"processed_{question_data['question_number']}.json")
                save_result(output_file, result)
                
                batch_results.append(result)
                
                # Update checkpoint after each file
                processed_files.append(file_name)
                save_checkpoint(processed_files)
                
                # Add a random delay between API calls to avoid rate limiting
                elapsed = time.time() - start_time
                print(f"Total processing time: {elapsed:.2f}s")
                
                if file_index < len(batch) - 1:  # Don't delay after the last file in batch
                    delay = random.uniform(MIN_REQUEST_DELAY, MAX_REQUEST_DELAY)
                    print(f"Waiting {delay:.2f}s before next request...")
                    time.sleep(delay)
                
            except Exception as e:
                error_msg = f"Error processing {file_path}: {str(e)}"
                print(f"ERROR: {error_msg}")
                with open(ERROR_LOG_FILE, 'a') as f:
                    f.write(f"[{datetime.now().isoformat()}] {error_msg}\n")
        
        all_results.extend(batch_results)
        
        batch_time = time.time() - batch_start_time
        avg_time_per_file = batch_time / len(batch) if batch else 0
        
        # Improved estimate based on number of remaining files
        remaining_count = len(remaining_files) - len(processed_files)
        est_remaining_time = avg_time_per_file * remaining_count
        
        hours, remainder = divmod(est_remaining_time, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        # Calculate estimated completion time
        completion_time = datetime.now() + timedelta(seconds=est_remaining_time)
        
        print(f"\nCompleted batch {i//BATCH_SIZE + 1}. Progress: {len(processed_files)}/{total_files} files ({(len(processed_files)/total_files*100):.1f}%)")
        print(f"Batch processing time: {batch_time:.2f}s (avg: {avg_time_per_file:.2f}s per file)")
        print(f"Estimated remaining time: {int(hours)}h {int(minutes)}m {int(seconds)}s")
        print(f"Estimated completion: {completion_time.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Save all results (updated after each batch)
        all_results_file = os.path.join(OUTPUT_DIR, "all_processed_questions.json")
        
        # Get previously processed results if they exist
        previously_processed = []
        if os.path.exists(all_results_file):
            try:
                with open(all_results_file, 'r', encoding='utf-8') as f:
                    previously_processed = json.load(f)
            except json.JSONDecodeError:
                pass
        
        # Combine with current results (avoiding duplicates by question number)
        existing_question_numbers = set(r.get("question_number") for r in all_results)
        combined_results = all_results + [r for r in previously_processed if r.get("question_number") not in existing_question_numbers]
        
        with open(all_results_file, 'w', encoding='utf-8') as f:
            json.dump(combined_results, f, indent=2, ensure_ascii=False)
        
        print(f"Updated all results file with {len(combined_results)} total questions")
    
    print(f"\nProcessing complete! Processed {len(processed_files)}/{total_files} files")
    print(f"All results saved to {os.path.join(OUTPUT_DIR, 'all_processed_questions.json')}")
    print(f"Check {ERROR_LOG_FILE} for any errors that occurred during processing")

if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Process Exam Packs HTML files with Mistral 7B.')
    parser.add_argument('--start', type=int, default=None, help='Start index (0-based) for processing files')
    parser.add_argument('--end', type=int, default=None, help='End index (0-based) for processing files')
    parser.add_argument('--limit', type=int, default=None, help='Limit the number of files to process')
    args = parser.parse_args()
    
    print("Starting Mistral 7B processing with Ollama for Exam Packs HTML files...")
    print(f"TEST MODE: Limited to first {TEST_MODE_LIMIT} questions")
    
    if args.start is not None or args.end is not None or args.limit is not None:
        print(f"Processing with custom range - Start: {args.start}, End: {args.end}, Limit: {args.limit}")
    
    start_time = time.time()
    process_all_files(args.start, args.end, args.limit)
    execution_time = time.time() - start_time
    hours, remainder = divmod(execution_time, 3600)
    minutes, seconds = divmod(remainder, 60)
    print(f"Processing complete! Total execution time: {int(hours)}h {int(minutes)}m {int(seconds)}s") 