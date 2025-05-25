import os
import json
import glob
import requests
from bs4 import BeautifulSoup

# Constants
HTML_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/html_specific')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/processed_specific')
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma:7b"  # Using the Gemma 7B model

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
        "html_content": html_content
    }

def extract_text_from_html(html_content):
    """Extract plain text from HTML content"""
    soup = BeautifulSoup(html_content, 'html.parser')
    return soup.get_text(separator=' ', strip=True)

def generate_response(question_data):
    """Generate response using Ollama API"""
    # Extract plain text to help the model
    plain_text = extract_text_from_html(question_data["html_content"])
    
    # Create prompt for the model with improved JSON instructions
    prompt = f"""
You are an expert GMAT tutor. I will give you a GMAT question with multiple choice options and statistics. Your task is to:

1. CAREFULLY separate the question text from the answer options. The question text should NOT include any of the answer options.
2. Clean up the question text by removing any repetitions, fixing formatting issues, and ensuring it's logically coherent.
3. Make sure mathematical expressions are correctly formatted (e.g., x^2 for x squared, √x for square root of x).
4. The options typically start with patterns like "A.", "B.", "(A)", "(B)", etc. Make sure these are properly identified as options, not part of the question.
5. For Data Sufficiency questions, include the standard GMAT format statements in the question, and use the standard Data Sufficiency answer options.
6. Determine the correct answer based on your mathematical expertise.
7. Provide a detailed step-by-step explanation of how to solve the problem.

Here is the GMAT question information:

Question Text (contains both the question and options mixed together):
{question_data["question_text"]}

Answer Statistics:
{json.dumps(question_data["answer_stats"], indent=2)}

Session Statistics:
{json.dumps(question_data["session_stats"], indent=2)}

IMPORTANT: You MUST format your response as a valid JSON object with this exact structure:
{{
  "question": "ONLY the cleaned-up question text WITHOUT any answer options. Remove any repetitions and ensure the question is logically coherent. Do NOT use escape characters like \\n. For multi-part questions or statements, use proper spacing and numbering (like 'I. statement', 'II. statement') without newline characters.",
  "options": {{
    "A": "text of option A",
    "B": "text of option B",
    "C": "text of option C",
    "D": "text of option D",
    "E": "text of option E"
  }},
  "correct_answer": "the letter of the correct answer (A, B, C, D, or E)",
  "explanation": "your step-by-step explanation",
  "answer_stats": {json.dumps(question_data["answer_stats"])},
  "session_stats": {json.dumps(question_data["session_stats"])}
}}

Remember, your entire response must be a valid JSON object with the structure shown above. Do not include any text before or after the JSON.
"""

    # Send request to Ollama API
    try:
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
            }
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
                    
                    # Validate the structure
                    required_keys = ["question", "options", "correct_answer", "explanation", "answer_stats", "session_stats"]
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
        return {"error": f"API request failed: {str(e)}"}

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

def process_all_files():
    """Process all HTML files in the directory"""
    # Get all HTML files
    html_files = glob.glob(os.path.join(HTML_DIR, 'question_*.html'))
    
    results = []
    
    for file_path in html_files:
        print(f"Processing {os.path.basename(file_path)}...")
        
        # Load HTML file
        question_data = load_html_file(file_path)
        if not question_data:
            print(f"Failed to load {file_path}")
            continue
        
        # Generate response
        response = generate_response(question_data)
        
        # Combine data
        result = {
            "question_number": question_data["question_number"],
            "source_url": question_data["source_url"],
            "analysis": response
        }
        
        # Save individual result
        output_file = os.path.join(OUTPUT_DIR, f"processed_{question_data['question_number']}.json")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        results.append(result)
        print(f"Processed and saved {output_file}")
    
    # Save all results
    all_results_file = os.path.join(OUTPUT_DIR, "all_processed_questions.json")
    with open(all_results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"All results saved to {all_results_file}")
    return results

if __name__ == "__main__":
    print("Starting improved Gemma processing with Ollama for specific HTML files...")
    process_all_files()
    print("Processing complete!") 