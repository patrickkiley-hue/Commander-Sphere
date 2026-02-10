# MTG Commander Tracker

A React web application for tracking Magic: the Gathering Commander playgroup statistics and game history.

## Project Structure

```
commander-tracker/
├── index.html                 # Entry HTML file
├── main.jsx                   # React entry point
├── App.jsx                    # Main app component with routing
├── App.css                    # Global styles
├── package.json               # Dependencies
├── vite.config.js            # Vite configuration
├── components/               # Reusable components
│   ├── ColorMana.jsx         # MTG color mana marbles
│   ├── ColorMana.css
│   ├── SwitchPlaygroupModal.jsx  # Modal for switching playgroups
│   └── SwitchPlaygroupModal.css
└── pages/                    # Page components
    ├── HomePage.jsx          # Main homepage (FULLY FUNCTIONAL)
    ├── HomePage.css
    ├── MyStatsPage.jsx       # Blank - to be built in future session
    ├── PodStatsPage.jsx      # Blank - to be built in future session
    ├── TrackGamePage.jsx     # Blank - to be built in future session
    ├── AdministratorPage.jsx # Blank - to be built in future session
    ├── GamesPlayedPage.jsx   # Blank - to be built in future session
    ├── TotalPlayersPage.jsx  # Blank - to be built in future session
    ├── UniqueDecksPage.jsx   # Blank - to be built in future session
    └── BlankPage.css         # Shared styles for blank pages
```

## Windows Setup Instructions (For Total Beginners)

### Step 1: Install Node.js

1. Go to https://nodejs.org/
2. Download the LTS (Long Term Support) version for Windows
3. Run the installer (.msi file)
4. Click "Next" through the installation wizard (keep all default settings)
5. Restart your computer after installation

### Step 2: Install Visual Studio Code

1. Go to https://code.visualstudio.com/
2. Download VS Code for Windows
3. Run the installer
4. During installation, check these boxes:
   - "Add to PATH"
   - "Create a desktop icon"
   - "Add 'Open with Code' action to context menu"
5. Complete the installation

### Step 3: Set Up Your Project

1. Create a folder on your computer for your project (e.g., `C:\Projects\commander-tracker`)
2. Copy all the files from this skeleton into that folder, maintaining the folder structure:
   - All root files (App.jsx, package.json, etc.) go in the main folder
   - Create a `components` folder and put component files there
   - Create a `pages` folder and put page files there

### Step 4: Open the Project in VS Code

1. Open Visual Studio Code
2. Click "File" → "Open Folder"
3. Navigate to your project folder and select it
4. Click "Select Folder"

### Step 5: Open the Terminal

1. In VS Code, click "Terminal" in the top menu
2. Click "New Terminal"
3. A terminal panel will open at the bottom of VS Code

### Step 6: Install Dependencies

In the terminal, type this command and press Enter:

```bash
npm install
```

This will download all the necessary packages. It might take a few minutes.

### Step 7: Run the Development Server

After installation completes, type this command and press Enter:

```bash
npm run dev
```

Your app should automatically open in your browser at `http://localhost:3000`

If it doesn't open automatically, copy that URL and paste it into your browser.

### Step 8: Making Changes

- Any changes you make to the files will automatically update in the browser
- To stop the development server, press `Ctrl + C` in the terminal
- To start it again, run `npm run dev`

## Current Features

### HomePage (Fully Functional)
- ✅ Administrator button → leads to blank admin page
- ✅ Switch Playgroup modal with:
  - Switch between joined playgroups (dropdown)
  - Join new playgroup (URL, email, phone, or Discord)
- ✅ Playgroup name display
- ✅ My Stats and Pod Stats buttons
- ✅ Track Game button
- ✅ Last Week Highlights with clickable stats
- ✅ Weekly participants display
- ✅ Color identity statistics (most played & highest win rate)
- ✅ Top performers ranking
- ✅ Featured decks of the week
- ✅ MTG color marbles (WUBRG order) throughout

### Blank Pages (Ready for Development)
All these pages currently show only a "Back to Home" button:
- My Stats
- Pod Stats
- Track Game
- Administrator
- Games Played
- Total Players
- Unique Decks

## Next Steps for Development

### Working on Individual Pages

1. In your next chat sessions, describe one page you want to build
2. Claude will create the full code for that specific page
3. You'll copy that code and replace the blank page file
4. Test in your browser
5. Repeat for other pages

### Google Sheets Integration

When you're ready to connect to Google Sheets:
- You'll need to set up Google Sheets API credentials
- Add environment variables for authentication
- Update the data fetching logic in the pages

### Key Design Principles

- **Color Marbles**: Always use WUBRG order (White, Blue, Black, Red, Green)
- **Colorless**: Use gray marble for colorless (C)
- **Commander Names**: Always followed by color marbles
- **No Abbreviations**: Don't use (RG), (URG) etc. - just the marbles

## Troubleshooting

### "npm is not recognized"
- Node.js wasn't installed correctly
- Restart your computer and try again
- Make sure you installed Node.js from nodejs.org

### Port 3000 is already in use
- Another app is using port 3000
- Change the port in `vite.config.js`:
  ```js
  server: {
    port: 3001,  // or any other number
    open: true
  }
  ```

### Changes not showing in browser
- Make sure the dev server is running (`npm run dev`)
- Try refreshing the browser (Ctrl + R or F5)
- Check the terminal for error messages

### Module not found errors
- Run `npm install` again
- Make sure all files are in the correct folders

## Contact & Support

If you run into issues:
1. Check the terminal for error messages
2. Make sure all files are in the correct locations
3. Try stopping the server (Ctrl + C) and starting it again
4. In a new chat with Claude, share the error message for help

## File Locations Reference

```
Root Level:
- index.html
- main.jsx
- App.jsx
- App.css
- package.json
- vite.config.js

components/ folder:
- ColorMana.jsx
- ColorMana.css
- SwitchPlaygroupModal.jsx
- SwitchPlaygroupModal.css

pages/ folder:
- HomePage.jsx
- HomePage.css
- MyStatsPage.jsx
- PodStatsPage.jsx
- TrackGamePage.jsx
- AdministratorPage.jsx
- GamesPlayedPage.jsx
- TotalPlayersPage.jsx
- UniqueDecksPage.jsx
- BlankPage.css
```
