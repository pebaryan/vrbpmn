#!/bin/bash

# VRBPMN Documentation Navigator
# A simple script to help navigate the VRBPMN documentation

echo "📚 VRBPMN Documentation Navigator"
echo "=================================="
echo ""

# Check if we have the right files
if [ ! -f "README.md" ]; then
    echo "❌ Error: Documentation files not found. Please run this from the vrbpmn directory."
    exit 1
fi

# Main menu
while true; do
    echo "📁 Available Documentation:"
    echo ""
    echo "1. 📖 README.md - Project Overview"
    echo "2. 🚀 GETTING_STARTED.md - User Guide"
    echo "3. 🛠 DEVELOPMENT_SETUP.md - Developer Setup"
    echo "4. 📖 TECHNICAL_DOCUMENTATION.md - Architecture Deep Dive"
    echo "5. 🗺 INDEX.md - Documentation Hub"
    echo "6. 📊 DOCUMENTATION_SUMMARY.md - Docs Overview"
    echo ""
    echo "9. 🔍 Search documentation"
    echo "0. ❌ Exit"
    echo ""
    
    read -p "Enter your choice (0-9): " choice
    echo ""
    
    case $choice in
        1)
            echo "Opening README.md..."
            if command -v xdg-open &> /dev/null; then
                xdg-open README.md
            elif command -v open &> /dev/null; then
                open README.md
            else
                cat README.md
            fi
            ;;
        
        2)
            echo "Opening GETTING_STARTED.md..."
            if command -v xdg-open &> /dev/null; then
                xdg-open GETTING_STARTED.md
            elif command -v open &> /dev/null; then
                open GETTING_STARTED.md
            else
                cat GETTING_STARTED.md
            fi
            ;;
            
        3)
            echo "Opening DEVELOPMENT_SETUP.md..."
            if command -v xdg-open &> /dev/null; then
                xdg-open DEVELOPMENT_SETUP.md
            elif command -v open &> /dev/null; then
                open DEVELOPMENT_SETUP.md
            else
                cat DEVELOPMENT_SETUP.md
            fi
            ;;
            
        4)
            echo "Opening TECHNICAL_DOCUMENTATION.md..."
            if command -v xdg-open &> /dev/null; then
                xdg-open TECHNICAL_DOCUMENTATION.md
            elif command -v open &> /dev/null; then
                open TECHNICAL_DOCUMENTATION.md
            else
                cat TECHNICAL_DOCUMENTATION.md
            fi
            ;;
            
        5)
            echo "Opening INDEX.md..."
            if command -v xdg-open &> /dev/null; then
                xdg-open INDEX.md
            elif command -v open &> /dev/null; then
                open INDEX.md
            else
                cat INDEX.md
            fi
            ;;
            
        6)
            echo "Opening DOCUMENTATION_SUMMARY.md..."
            if command -v xdg-open &> /dev/null; then
                xdg-open DOCUMENTATION_SUMMARY.md
            elif command -v open &> /dev/null; then
                open DOCUMENTATION_SUMMARY.md
            else
                cat DOCUMENTATION_SUMMARY.md
            fi
            ;;
            
        9)
            read -p "Enter search term: " search_term
            echo ""
            echo "Searching for '$search_term' in documentation..."
            echo ""
            grep -r --color=auto "$search_term" *.md || echo "No matches found."
            echo ""
            ;;
            
        0)
            echo "👋 Goodbye! Happy documenting!"
            exit 0
            ;;
            
        *)
            echo "❌ Invalid choice. Please try again."
            ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..." -r
    echo ""
done