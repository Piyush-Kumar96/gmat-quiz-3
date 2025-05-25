import os
import json
import glob
from bs4 import BeautifulSoup
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

# Constants
HTML_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/html')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/processed')
MODEL_ID = "google/gemma-3-27b-it"  # Using the instruction-tuned version

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
    
    # Extract question content
    question_content = soup.select_one('.question-container')
    if not question_content:
        return None
    
    # Clean up the HTML by removing the source-url div
    source_div = question_content.select_one('.source-url')
    if source_div:
        source_div.decompose()
    
    # Get the cleaned HTML content
    html_content = str(question_content)
    
    return {
        "question_number": question_number,
        "source_url": source_url,
        "html_content": html_content
    }

def setup_model():
    """Setup the Gemma 3 model"""
    print("Setting up Gemma 3 model...")
    
    # Load tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        device_map="auto",
        torch_dtype=torch.float16,
    )
    
    print("Model loaded successfully!")
    return tokenizer, model

def generate_response(tokenizer, model, html_content):
    """Generate response from Gemma 3 model"""
    # Create prompt for the model
    prompt = f"""
You are an expert GMAT tutor. Analyze the following GMAT question HTML content and:

1. Extract the question text
2. Identify all answer options (A, B, C, D, E)
3. Determine the correct answer
4. Provide a detailed step-by-step explanation of how to solve the problem
5. Format your response as JSON with the following structure:
{{
  "question": "extracted question text",
  "options": {{
    "A": "option A text",
    "B": "option B text",
    "C": "option C text",
    "D": "option D text",
    "E": "option E text"
  }},
  "correct_answer": "letter of the correct answer (A, B, C, D, or E)",
  "explanation": "detailed step-by-step explanation"
}}

Here is the HTML content:
{html_content}
"""

    # Tokenize the prompt
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    
    # Generate response
    outputs = model.generate(
        **inputs,
        max_new_tokens=2048,
        temperature=0.1,
        top_p=0.9,
        do_sample=True
    )
    
    # Decode the response
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    # Extract just the model's response (after the prompt)
    response = response[len(prompt):]
    
    # Try to extract JSON from the response
    try:
        # Find the first { and the last }
        start_idx = response.find('{')
        end_idx = response.rfind('}') + 1
        
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response[start_idx:end_idx]
            result = json.loads(json_str)
            return result
        else:
            return {"error": "Could not extract JSON", "raw_response": response}
    except json.JSONDecodeError:
        return {"error": "Invalid JSON format", "raw_response": response}

def process_all_files():
    """Process all HTML files in the directory"""
    # Setup model
    tokenizer, model = setup_model()
    
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
        response = generate_response(tokenizer, model, question_data["html_content"])
        
        # Combine data
        result = {
            "question_number": question_data["question_number"],
            "source_url": question_data["source_url"],
            "analysis": response
        }
        
        # Save individual result
        output_file = os.path.join(OUTPUT_DIR, f"processed_{question_data['question_number']}.json")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        
        results.append(result)
        print(f"Processed and saved {output_file}")
    
    # Save all results
    all_results_file = os.path.join(OUTPUT_DIR, "all_processed_questions.json")
    with open(all_results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    
    print(f"All results saved to {all_results_file}")
    return results

if __name__ == "__main__":
    print("Starting Gemma 3 processing...")
    process_all_files()
    print("Processing complete!") 