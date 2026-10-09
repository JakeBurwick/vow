#!/usr/bin/env python3
import sys

def html_escape(text):
    """Escape HTML special characters: & < >"""
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    return text

def apply_formatting(text):
    """Apply code and bold formatting in order"""
    # First: apply code formatting (backticks)
    result = []
    i = 0
    while i < len(text):
        if text[i] == '`':
            # Look for closing backtick on same line
            close = text.find('`', i + 1)
            if close != -1:
                # Found matching backtick
                code_content = text[i+1:close]
                result.append('<code>')
                result.append(code_content)
                result.append('</code>')
                i = close + 1
            else:
                # No closing backtick, keep literal
                result.append(text[i])
                i += 1
        else:
            result.append(text[i])
            i += 1

    text = ''.join(result)

    # Second: apply bold formatting (**)
    result = []
    i = 0
    while i < len(text):
        if i < len(text) - 1 and text[i:i+2] == '**':
            # Look for closing **
            close = text.find('**', i + 2)
            if close != -1:
                # Found matching **
                bold_content = text[i+2:close]
                result.append('<strong>')
                result.append(bold_content)
                result.append('</strong>')
                i = close + 2
            else:
                # No closing **, keep literal
                result.append(text[i])
                i += 1
        else:
            result.append(text[i])
            i += 1

    return ''.join(result)

def markdown_to_html(md_text):
    """Convert markdown to HTML blocks"""
    if not md_text.strip():
        return []

    lines = md_text.split('\n')
    blocks = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Skip blank lines
        if not line.strip():
            i += 1
            continue

        # Check for headings
        if line.startswith('# '):
            content = line[2:]
            content = html_escape(content)
            content = apply_formatting(content)
            blocks.append(f'<h1>{content}</h1>')
            i += 1
        elif line.startswith('## '):
            content = line[3:]
            content = html_escape(content)
            content = apply_formatting(content)
            blocks.append(f'<h2>{content}</h2>')
            i += 1
        elif line.startswith('### '):
            content = line[4:]
            content = html_escape(content)
            content = apply_formatting(content)
            blocks.append(f'<h3>{content}</h3>')
            i += 1
        # Check for list item
        elif line.startswith('- '):
            # Collect all consecutive list items
            list_items = []
            while i < len(lines) and lines[i].startswith('- '):
                item_content = lines[i][2:]
                item_content = html_escape(item_content)
                item_content = apply_formatting(item_content)
                list_items.append(item_content)
                i += 1

            # Create single list line
            html_items = ''.join(f'<li>{item}</li>' for item in list_items)
            blocks.append(f'<ul>{html_items}</ul>')
        # Otherwise it's a paragraph
        else:
            para_lines = []
            while i < len(lines) and lines[i].strip() and not lines[i].startswith('# ') and not lines[i].startswith('## ') and not lines[i].startswith('### ') and not lines[i].startswith('- '):
                para_lines.append(lines[i].strip())
                i += 1

            # Join with single spaces
            content = ' '.join(para_lines)
            content = html_escape(content)
            content = apply_formatting(content)
            blocks.append(f'<p>{content}</p>')

    return blocks

if __name__ == '__main__':
    if len(sys.argv) > 1:
        md_text = sys.argv[1]
    else:
        md_text = sys.stdin.read()

    blocks = markdown_to_html(md_text)
    for block in blocks:
        print(block)
