import os
import glob

replacements = {
    "Control/Tracking #": "Control/Reference #",
    "Control/Tracking Number": "Control/Reference Number",
    ">Tracking #<": ">Control/Reference #<",
    "# Control No.": "# Control/Reference #",
    "PPA Records Process Flow": "PMO-Negros Occidental/Bacolod/Banago Records Process Flow"
}

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated: {filepath}")

if __name__ == "__main__":
    base_dir = r"c:\doctrack-ui\src"
    search_path = os.path.join(base_dir, '**', '*.jsx')
    for filepath in glob.glob(search_path, recursive=True):
        process_file(filepath)
    
    search_path_js = os.path.join(base_dir, '**', '*.js')
    for filepath in glob.glob(search_path_js, recursive=True):
        process_file(filepath)
    
    print("Done replacing labels.")
