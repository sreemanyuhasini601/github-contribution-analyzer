# GitHub Contribution Analyzer

## Overview

GitHub Contribution Analyzer is a system that analyzes a developer’s GitHub profile and extracts meaningful insights from their activity.

It transforms raw GitHub data into structured and visual insights such as coding patterns, activity level, language usage, developer type, and skill insights.

---

## Key Idea

- Takes a GitHub username as input  
- Fetches real-time data using GitHub REST API  
- Analyzes repositories, languages, stars, and activity  
- Converts raw data into meaningful insights and visualizations  

---

## Features

### Profile Analysis
- Profile picture, name, bio  
- Followers and following  
- Public repositories  
- Account details  

---

### Repository Analysis
- Repository name  
- Stars and forks  
- Primary language  
- Top repositories based on stars  

---

### Language (Tech Stack) Analysis
- Extract programming languages from repositories  
- Calculate language frequency  
- Display results using charts  

---

### Activity Analysis
- Yearly contribution pattern  
- Activity consistency level (High / Medium / Low)  

---

### Code Streak
- Current streak calculation  
- Longest streak tracking  

---

### Developer Classification
- Frontend Developer  
- Backend Developer  
- Full Stack Developer  
- Python Developer  
- General Developer  

---

### Insight Generation

- Rule-based developer classification  
- LLM (AI model) powered insights for:
  - Skill level prediction (Beginner / Intermediate / Advanced)  
  - Coding pattern analysis  
  - Developer behavior insights  

---

## 🛠 Tech Stack

### Frontend
- React.js  
- Tailwind CSS  
- JavaScript  
- Chart.js  

### API
- GitHub REST API  
- LLM API (for AI-based insights)

### Tools
- VS Code  
- Node.js  

---

## How It Works

1. User enters a GitHub username  
2. Application fetches data using GitHub API  
3. Data is processed and analyzed using custom logic  
4. LLM generates intelligent insights  
5. Results are displayed using charts and UI components  

---

## Core Engineering Logic

### Fallback System
GitHub data is not always complete or reliable.  
To handle this, the system uses a fallback approach:
- Primary source: GitHub contribution data API  
- Secondary source: repository-level activity signals  

This ensures the application always produces meaningful output.

---

### Streak Calculation
Streaks are calculated based on consecutive active days.  
If there is a gap in activity, the current streak resets while the longest streak is preserved.

---

## Future Improvements

- AI-based skill analysis improvements using LLMs  
- GraphQL-based optimization for contribution data  
- Developer comparison feature  
- SaaS deployment with AI-powered insights  

---

## Author

Built as a GitHub profile analysis tool that converts raw data into meaningful developer insights.