from llmlingua import PromptCompressor

# Initializes the compressor using a small, lightning-fast model
compressor = PromptCompressor("gpt2")

# Paste whatever giant text, log, or documentation you want to shrink right here
massive_text = """
PASTE YOUR TEXT HERE
"""

# Shrink the text by roughly 50%
results = compressor.compress_prompt(
    massive_text, 
    instruction="", 
    question="", 
    rate=0.5
)

print("\n--- COMPRESSED TEXT ---")
print(results['compressed_prompt'])