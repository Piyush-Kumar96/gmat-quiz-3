import os
import json
import glob

# Constants
IMPROVED_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/processed_improved')
FINAL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/final_results')

# Create output directory if it doesn't exist
os.makedirs(FINAL_DIR, exist_ok=True)

def load_json_file(file_path):
    """Load JSON file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return None

def is_valid_result(result):
    """Check if a result is valid"""
    if not result or 'analysis' not in result:
        return False
    
    analysis = result['analysis']
    
    # Check if analysis is an error
    if isinstance(analysis, dict) and 'error' in analysis:
        return False
    
    # Check if analysis has all required keys
    required_keys = ["question", "options", "correct_answer", "explanation"]
    return all(key in analysis for key in required_keys)

def process_results():
    """Process all results from the improved directory"""
    # Get all JSON files
    json_files = glob.glob(os.path.join(IMPROVED_DIR, 'processed_*.json'))
    
    combined_results = []
    
    for file_path in json_files:
        print(f"Processing {os.path.basename(file_path)}...")
        
        # Load JSON file
        result = load_json_file(file_path)
        
        if is_valid_result(result):
            # Save the result to the final directory
            question_number = result['question_number']
            output_file = os.path.join(FINAL_DIR, f'question_{question_number}.json')
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2)
            
            combined_results.append(result)
            print(f"Saved valid result to {output_file}")
        else:
            # Try to fix the result
            fixed_result = fix_result(result)
            if fixed_result:
                # Save the fixed result
                question_number = fixed_result['question_number']
                output_file = os.path.join(FINAL_DIR, f'question_{question_number}.json')
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(fixed_result, f, indent=2)
                
                combined_results.append(fixed_result)
                print(f"Saved fixed result to {output_file}")
            else:
                print(f"Could not fix result for {os.path.basename(file_path)}")
    
    # Save all results
    all_results_file = os.path.join(FINAL_DIR, "all_questions.json")
    with open(all_results_file, 'w', encoding='utf-8') as f:
        json.dump(combined_results, f, indent=2)
    
    print(f"All results saved to {all_results_file}")
    print(f"Total valid results: {len(combined_results)}")
    return combined_results

def fix_result(result):
    """Try to fix an invalid result"""
    if not result:
        return None
    
    question_number = result['question_number']
    source_url = result['source_url']
    
    # Check if the analysis contains error information
    if 'analysis' in result and isinstance(result['analysis'], dict) and 'error' in result['analysis']:
        analysis = result['analysis']
        
        # Initialize fixed analysis
        fixed_analysis = {
            "question": "",
            "options": {
                "A": "",
                "B": "",
                "C": "",
                "D": "",
                "E": ""
            },
            "correct_answer": "",
            "explanation": ""
        }
        
        # Try to extract from partial_json
        if 'partial_json' in analysis and isinstance(analysis['partial_json'], dict):
            partial_json = analysis['partial_json']
            
            # Map common key variations
            key_mappings = {
                "question": ["question", "prompt", "problem"],
                "correct_answer": ["correct_answer", "answer", "correct", "solution"],
                "explanation": ["explanation", "solution", "reasoning", "steps"]
            }
            
            # Extract direct fields
            for target_key, possible_keys in key_mappings.items():
                for key in possible_keys:
                    if key in partial_json:
                        fixed_analysis[target_key] = partial_json[key]
                        break
            
            # Extract options
            if "options" in partial_json and isinstance(partial_json["options"], dict):
                for opt in "ABCDE":
                    if opt in partial_json["options"]:
                        fixed_analysis["options"][opt] = partial_json["options"][opt]
        
        # Try to extract from raw_response
        if 'raw_response' in analysis:
            raw_response = analysis['raw_response']
            
            # Try to extract question if missing
            if not fixed_analysis["question"] and "question:" in raw_response.lower():
                lines = raw_response.split('\n')
                for i, line in enumerate(lines):
                    if "question:" in line.lower():
                        if i+1 < len(lines) and lines[i+1].strip():
                            fixed_analysis["question"] = lines[i+1].strip()
                            break
                        else:
                            parts = line.split(':', 1)
                            if len(parts) > 1:
                                fixed_analysis["question"] = parts[1].strip()
            
            # Try to extract options if missing
            option_markers = ["A:", "B:", "C:", "D:", "E:"]
            for marker in option_markers:
                opt = marker[0]
                if not fixed_analysis["options"][opt] and marker in raw_response:
                    parts = raw_response.split(marker, 1)
                    if len(parts) > 1:
                        option_text = parts[1].split('\n')[0].strip()
                        fixed_analysis["options"][opt] = option_text
            
            # Try to extract correct answer if missing
            if not fixed_analysis["correct_answer"] and ("correct answer:" in raw_response.lower() or "answer:" in raw_response.lower()):
                lines = raw_response.split('\n')
                for line in lines:
                    if "correct answer:" in line.lower() or "answer:" in line.lower():
                        parts = line.split(':', 1)
                        if len(parts) > 1:
                            answer = parts[1].strip()
                            if answer and answer[0] in "ABCDE":
                                fixed_analysis["correct_answer"] = answer[0]
            
            # Try to extract explanation if missing
            if not fixed_analysis["explanation"] and ("explanation:" in raw_response.lower() or "solution:" in raw_response.lower()):
                lines = raw_response.split('\n')
                for i, line in enumerate(lines):
                    if "explanation:" in line.lower() or "solution:" in line.lower():
                        explanation_lines = []
                        for j in range(i+1, len(lines)):
                            if any(marker in lines[j] for marker in ["question:", "options:", "correct answer:"]):
                                break
                            explanation_lines.append(lines[j])
                        fixed_analysis["explanation"] = '\n'.join(explanation_lines).strip()
        
        # Check if we have enough information to create a valid result
        if fixed_analysis["question"] and fixed_analysis["correct_answer"] and fixed_analysis["explanation"]:
            return {
                "question_number": question_number,
                "source_url": source_url,
                "analysis": fixed_analysis
            }
    
    return None

if __name__ == "__main__":
    print("Processing results...")
    process_results()
    print("Processing complete!") 