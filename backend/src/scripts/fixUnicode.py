import os
import json
import glob

# Constants
FINAL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/final_results')
FIXED_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports/final_results_fixed')

# Create output directory if it doesn't exist
os.makedirs(FIXED_DIR, exist_ok=True)

def fix_unicode_in_string(text):
    """Fix Unicode escape sequences in a string"""
    if not isinstance(text, str):
        return text
    
    # The JSON parser already converts \uXXXX to the actual Unicode character
    # So we don't need to do anything special here
    return text

def fix_unicode_in_dict(data):
    """Recursively fix Unicode escape sequences in a dictionary"""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, str):
                data[key] = fix_unicode_in_string(value)
            elif isinstance(value, dict):
                data[key] = fix_unicode_in_dict(value)
            elif isinstance(value, list):
                data[key] = [fix_unicode_in_dict(item) if isinstance(item, dict) else 
                            fix_unicode_in_string(item) if isinstance(item, str) else 
                            item for item in value]
    return data

def process_files():
    """Process all JSON files in the final_results directory"""
    # Get all JSON files
    json_files = glob.glob(os.path.join(FINAL_DIR, '*.json'))
    
    for file_path in json_files:
        print(f"Processing {os.path.basename(file_path)}...")
        
        # Load JSON file
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Fix Unicode escape sequences
        if isinstance(data, list):
            fixed_data = [fix_unicode_in_dict(item) for item in data]
        else:
            fixed_data = fix_unicode_in_dict(data)
        
        # Save fixed JSON file
        output_file = os.path.join(FIXED_DIR, os.path.basename(file_path))
        with open(output_file, 'w', encoding='utf-8') as f:
            # Use ensure_ascii=False to output actual Unicode characters instead of escape sequences
            json.dump(fixed_data, f, indent=2, ensure_ascii=False)
        
        print(f"Fixed and saved to {output_file}")
    
    print("All files processed successfully!")

if __name__ == "__main__":
    print("Fixing Unicode escape sequences in JSON files...")
    process_files()
    print("Processing complete!") 