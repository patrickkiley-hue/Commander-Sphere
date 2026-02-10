# Commander Tracker - Complete File Structure

## How to Set Up Your Folders

Create this exact folder structure on your computer:

```
C:\Projects\commander-tracker\          (or wherever you want)
│
├── index.html
├── main.jsx
├── App.jsx
├── App.css
├── package.json
├── vite.config.js
├── README.md
├── FILE_STRUCTURE.md (this file)
│
├── components\
│   ├── ColorMana.jsx
│   ├── ColorMana.css
│   ├── SwitchPlaygroupModal.jsx
│   └── SwitchPlaygroupModal.css
│
└── pages\
    ├── HomePage.jsx
    ├── HomePage.css
    ├── MyStatsPage.jsx
    ├── PodStatsPage.jsx
    ├── TrackGamePage.jsx
    ├── AdministratorPage.jsx
    ├── GamesPlayedPage.jsx
    ├── TotalPlayersPage.jsx
    ├── UniqueDecksPage.jsx
    └── BlankPage.css
```

## Step-by-Step Setup on Windows

### 1. Create the Main Folder
1. Open File Explorer
2. Navigate to where you want your project (e.g., `C:\Projects\`)
3. Right-click → New → Folder
4. Name it `commander-tracker`

### 2. Create the components Folder
1. Open the `commander-tracker` folder
2. Right-click → New → Folder
3. Name it `components`

### 3. Create the pages Folder
1. In the `commander-tracker` folder
2. Right-click → New → Folder
3. Name it `pages`

### 4. Add the Files
Now you need to create all the files listed above. Here's how:

#### For Root Files:
1. Right-click in the `commander-tracker` folder
2. New → Text Document
3. Rename it to the correct filename (e.g., `App.jsx`)
4. When Windows asks "Are you sure you want to change the extension?", click Yes
5. Open the file in VS Code and paste the corresponding code

#### For Component Files:
1. Open the `components` folder
2. Create each file the same way
3. Paste the corresponding code

#### For Page Files:
1. Open the `pages` folder
2. Create each file the same way
3. Paste the corresponding code

## File Descriptions

### Root Level Files

**index.html**
- The main HTML file that loads your React app
- Don't modify this unless instructed

**main.jsx**
- React entry point
- Connects React to the HTML

**App.jsx**
- Main application component
- Contains routing for all pages
- Manages playgroup state

**App.css**
- Global styles for the entire app

**package.json**
- Lists all dependencies
- Contains npm scripts

**vite.config.js**
- Configuration for the Vite build tool

**README.md**
- Complete setup and usage instructions

### components Folder

**ColorMana.jsx**
- Component for displaying MTG color marbles
- Handles WUBRG ordering
- Used throughout the app

**ColorMana.css**
- Styles for the color marbles
- Different size variants

**SwitchPlaygroupModal.jsx**
- Modal popup for switching playgroups
- Handles joining new playgroups
- Two tabs: Switch and Join

**SwitchPlaygroupModal.css**
- Styles for the modal

### pages Folder

**HomePage.jsx**
- The main homepage (FULLY FUNCTIONAL)
- Displays all weekly stats
- Navigation to other pages

**HomePage.css**
- Complete styling for the homepage

**MyStatsPage.jsx through UniqueDecksPage.jsx**
- Blank placeholder pages
- Each has a "Back to Home" button
- Ready to be filled in future sessions

**BlankPage.css**
- Shared styles for all blank pages

## Checking Your Setup

After creating all files and folders, your folder should look like this in File Explorer:

```
commander-tracker/
├── 📄 index.html
├── 📄 main.jsx
├── 📄 App.jsx
├── 📄 App.css
├── 📄 package.json
├── 📄 vite.config.js
├── 📄 README.md
├── 📄 FILE_STRUCTURE.md
├── 📁 components/
│   ├── 📄 ColorMana.jsx
│   ├── 📄 ColorMana.css
│   ├── 📄 SwitchPlaygroupModal.jsx
│   └── 📄 SwitchPlaygroupModal.css
└── 📁 pages/
    ├── 📄 HomePage.jsx
    ├── 📄 HomePage.css
    ├── 📄 MyStatsPage.jsx
    ├── 📄 PodStatsPage.jsx
    ├── 📄 TrackGamePage.jsx
    ├── 📄 AdministratorPage.jsx
    ├── 📄 GamesPlayedPage.jsx
    ├── 📄 TotalPlayersPage.jsx
    ├── 📄 UniqueDecksPage.jsx
    └── 📄 BlankPage.css
```

## Common Mistakes to Avoid

❌ **Don't create a `src` folder** - Files go directly in the root, components, and pages folders

❌ **Don't change file extensions** - .jsx files are NOT .js files

❌ **Don't rename folders** - They must be exactly `components` and `pages` (lowercase)

❌ **Don't put CSS files in the wrong folder** - Each CSS file goes with its corresponding JSX file

## If You Get Lost

The import statements in the files show you where things should be:

In `App.jsx`:
```jsx
import HomePage from './pages/HomePage';  // → pages/HomePage.jsx
```

In `HomePage.jsx`:
```jsx
import ColorMana from '../components/ColorMana';  // → components/ColorMana.jsx
import './HomePage.css';  // → pages/HomePage.css
```

The `./` means "same folder"
The `../` means "go up one folder"

## Need Help?

If your file structure doesn't match this guide:
1. Double-check folder names (case matters!)
2. Make sure all files have the correct extensions
3. Verify files are in the right folders
4. Check that you have both .jsx and .css files where needed
