#!/usr/bin/env bash
# Creates a new flashcard deck repository with proper structure
# Usage: ./scripts/create-deck-repo.sh <repo-path> [--topic <topic-name>]

set -e

REPO_PATH=""
TOPIC=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --topic)
            TOPIC="$2"
            shift 2
            ;;
        *)
            if [ -z "$REPO_PATH" ]; then
                REPO_PATH="$1"
            else
                echo "Error: Unknown argument '$1'"
                exit 1
            fi
            shift
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLASHCARDS_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$REPO_PATH" ]; then
    echo "Usage: $0 <repo-path> [--topic <topic-name>]"
    echo ""
    echo "Examples:"
    echo "  $0 ~/notes/intro-mechanics"
    echo "  $0 ~/notes/organic-chem --topic chemistry"
    echo "  $0 ~/notes/calculus-1 --topic mathematics"
    echo ""
    echo "The subject name will be derived from the folder name."
    echo "Optional --topic flag will copy guides/<topic>.md if it exists."
    exit 1
fi

# Extract subject name from folder basename
FOLDER_NAME=$(basename "$REPO_PATH")
# Convert folder name to human-readable subject name (replace hyphens/underscores with spaces, capitalize)
SUBJECT_NAME=$(echo "$FOLDER_NAME" | sed 's/[-_]/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')
CURRENT_DATE=$(date +%Y-%m-%d)

echo -e "${BLUE}Creating flashcard repository${NC}"
echo -e "${BLUE}Location: $REPO_PATH${NC}"
echo -e "${BLUE}Subject:  $SUBJECT_NAME${NC}"
echo -e "${BLUE}Date:     $CURRENT_DATE${NC}"
echo ""

# Create directory structure
mkdir -p "$REPO_PATH/flashcards"
mkdir -p "$REPO_PATH/references"
mkdir -p "$REPO_PATH/figures"

echo -e "${GREEN}✓${NC} Created directory structure:"
echo "  - flashcards/   (markdown flashcard files)"
echo "  - references/   (source PDFs and textbooks, gitignored)"
echo "  - figures/      (extracted images and diagrams)"
echo ""

# Copy and substitute README template
if [ -f "$FLASHCARDS_ROOT/guides/templates/README.md" ]; then
    sed -e "s/{SUBJECT_NAME}/$SUBJECT_NAME/g" \
        -e "s/{DATE}/$CURRENT_DATE/g" \
        "$FLASHCARDS_ROOT/guides/templates/README.md" > "$REPO_PATH/README.md"
    echo -e "${GREEN}✓${NC} Created README.md from template"
else
    echo -e "${YELLOW}⚠${NC} Template not found: guides/templates/README.md"
fi

# Copy and substitute CLAUDE.md template
if [ -f "$FLASHCARDS_ROOT/guides/templates/CLAUDE.md" ]; then
    sed -e "s/{SUBJECT_NAME}/$SUBJECT_NAME/g" \
        -e "s/{DATE}/$CURRENT_DATE/g" \
        "$FLASHCARDS_ROOT/guides/templates/CLAUDE.md" > "$REPO_PATH/CLAUDE.md"
    echo -e "${GREEN}✓${NC} Created CLAUDE.md from template"
else
    echo -e "${YELLOW}⚠${NC} Template not found: guides/templates/CLAUDE.md"
fi

# Copy topic-specific guide if --topic flag is provided
if [ -n "$TOPIC" ]; then
    TOPIC_GUIDE="$FLASHCARDS_ROOT/guides/$TOPIC.md"
    if [ -f "$TOPIC_GUIDE" ]; then
        cp "$TOPIC_GUIDE" "$REPO_PATH/$TOPIC.md"
        echo -e "${GREEN}✓${NC} Copied topic-specific guide: $TOPIC.md"
    else
        echo -e "${YELLOW}⚠${NC} Topic guide not found: guides/$TOPIC.md (skipping)"
    fi
fi

# Create .gitignore
cat > "$REPO_PATH/.gitignore" <<'EOF'
# Reference materials (PDFs, textbooks - keep local for copyright)
references/

# macOS
.DS_Store

# Temporary files
*.tmp
*.swp
*~

# Editor directories
.vscode/
.idea/
EOF

echo -e "${GREEN}✓${NC} Created .gitignore (references/ folder ignored)"
echo ""

# Create example flashcard file
cat > "$REPO_PATH/flashcards/example.md" <<EOF
Q: What is the purpose of this file?
A: To demonstrate the flashcard format. Delete this file and create your own!

C: Flashcards use [Q:/A:] for questions, [C:] for cloze deletions, and [P:/S:] for problems.

Q: Where can I find flashcard writing guidelines?
A: See CLAUDE.md in this repository for $SUBJECT_NAME-specific guidelines, and FLASHCARD_GUIDE.md in the flashcards repo for universal principles.

---

# Delete this file when you're ready to create your own flashcards!
EOF

echo -e "${GREEN}✓${NC} Created example flashcard file (flashcards/example.md)"
echo ""

# Initialize git repository
if [ ! -d "$REPO_PATH/.git" ]; then
    cd "$REPO_PATH"
    git init
    git add .
    git commit -m "Initial commit: $SUBJECT_NAME flashcards

🎯 Created with create-deck-repo.sh

Structure:
- flashcards/: Markdown flashcard files
- references/: Source PDFs and materials (gitignored)
- figures/: Extracted images and diagrams
- CLAUDE.md: Subject-specific flashcard guide

📚 Follows flashcards project conventions
"
    echo -e "${GREEN}✓${NC} Initialized git repository with initial commit"
    echo ""
else
    echo -e "${BLUE}ℹ${NC} Git repository already exists, skipping initialization"
    echo ""
fi

# Final summary
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}✓ Repository created successfully!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "📁 Location: $REPO_PATH"
echo "📚 Subject:  $SUBJECT_NAME"
echo ""
echo "📝 Next steps:"
echo "  1. cd $REPO_PATH"
echo "  2. Add source PDFs to references/"
echo "  3. Extract figures using:"
echo "     python3 $FLASHCARDS_ROOT/scripts/extract_figures_from_pdf.py \\"
echo "       --pdf references/textbook.pdf \\"
echo "       --output figures/01_topic_name/"
echo "  4. Create flashcards in flashcards/*.md"
echo "  5. Read CLAUDE.md for $SUBJECT_NAME-specific guidelines"
echo ""
echo "🔗 To push to GitHub organization (optional):"
echo "  1. Create repo 'thomasrribeiro-flashcards/$FOLDER_NAME' on GitHub"
echo "  2. git remote add origin git@github.com:thomasrribeiro-flashcards/$FOLDER_NAME.git"
echo "  3. git push -u origin master"
echo ""
echo "🚀 To use with flashcards app:"
echo "  Add this repository as a deck in the flashcards app"
echo ""
echo "📖 Happy studying!"
