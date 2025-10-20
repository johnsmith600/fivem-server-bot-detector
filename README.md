[![License: Proprietary – No Redistribution](https://img.shields.io/badge/License-Proprietary--No--Redistribution-red.svg)](./LICENSE)


# FiveM Bot Detection Tool v3.0

🛡️ **Ultra-conservative FiveM server bot detection tool with bulletproof validation, zero false positives, and comprehensive analysis.**

## ✨ Features

- **🛡️ Bulletproof Detection**: Multi-layer validation system with zero false positives
- **🏷️ Server Information**: Extracts server name, resource count, player limits, and metadata
- **📊 Detailed Statistics**: Comprehensive reporting with player counts, bot percentages, and scan duration
- **⚡ Progress Tracking**: Real-time progress bars and verbose logging options
- **🔄 Retry Logic**: Automatic retry with exponential backoff for failed requests
- **⏱️ Rate Limiting**: Configurable delays to respect API limits
- **💾 Export Results**: Save detailed results to JSON files
- **⚙️ Configuration**: Customizable settings via config files
- **🛡️ Error Handling**: Robust error handling with detailed error reporting
- **🎨 Beautiful UI**: Emoji-rich console output with progress indicators
- **🔍 Context Analysis**: Server type, population, and environment-aware detection
- **📋 Whitelist System**: Protects legitimate name patterns from false detection
- **🎯 Population-Based Safeguards**: Different thresholds based on server population

## Prerequisites

- **Node.js** (version 12 or higher)
- **Steam API Key** (get one at [Steam Web API](https://steamcommunity.com/dev/apikey))
- **curl** command available in your system

## 📖 How To Use

### **Step 1: Get a FiveM Server CFX Code**
1. Go to [FiveM Server List](https://servers.fivem.net/)
2. Find the server you want to check
3. Copy the server's CFX code (e.g., `7g3mbr`, `abc123`)

### **Step 2: Configure Your Steam API Key**
Choose one of these methods:

**Method A: Edit the script directly**
```javascript
// Open fivem-bot-detection.js and find this section:
const CONFIG = {
    API_KEY: "steam_api_key_here",  // ← Replace with your actual API key
    // ... other settings
};
```

**Method B: Create a config.json file**
```json
{
  "apiKey": "your_steam_api_key_here",
  "requestTimeout": 10000,
  "rateLimitDelay": 100
}
```

### **Step 3: Run the Bot Detection**
```bash
# Basic usage
node fivem-bot-detection.js <cfxcode>

# Examples:
node fivem-bot-detection.js 7g3mbr
node fivem-bot-detection.js abc123
```

### **Step 4: Understand the Results**
The tool will show you:
- **Server Information**: Name, resources, player count, game type
- **Bot Detection Results**: Number of potential bots found
- **Confidence Scores**: How certain the detection is
- **Validation Details**: Which checks passed/failed

### **Advanced Usage Examples**

```bash
# Verbose mode (shows detailed analysis)
node fivem-bot-detection.js 7g3mbr --verbose

# Save results to file
node fivem-bot-detection.js 7g3mbr --output scan-results.json

# Use custom configuration
node fivem-bot-detection.js 7g3mbr --config myconfig.json

# Combine all options
node fivem-bot-detection.js 7g3mbr --verbose --output results.json --config config.json
```

### **Understanding the Output**

#### **✅ No Bots Detected**
```
✅ No potential bots detected!
```
This means the ultra-conservative system found no suspicious players.

#### **🚨 Bots Detected**
```
🚨 BOT DETECTION ALERT!
=======================
Bot Score: 2/20 (10%)
```
This shows how many potential bots were found out of total players.

#### **📊 Detailed Statistics**
- **Steam Players**: Players with Steam accounts
- **Valid Profiles**: Steam profiles that passed validation
- **Potential Bots**: Players flagged as suspicious
- **Confidence**: How certain the detection is (85-100%)

### **What Makes This Tool Special**

🛡️ **Zero False Positives**: The ultra-conservative system only flags players with overwhelming evidence of being bots.

📋 **Whitelist Protection**: Common legitimate name patterns (like "Player123", "John_Doe") are automatically protected.

🎯 **Population-Based**: Detection thresholds adjust based on server size - larger servers require more evidence.

🔍 **Multi-Layer Validation**: 6 different validation layers ensure accurate detection.

## 🚀 Quick Start

1. **Clone or download this repository**
2. **Install dependencies** (none required for basic functionality):
   ```bash
   npm install
   ```

3. **Configure your Steam API key**:
   - Edit `fivem-bot-detection.js` and replace the API key
   - Or create a `config.json` file (see Configuration section)

4. **Run the tool**:
   ```bash
   node fivem-bot-detection.js <cfxcode>
   ```

## 📖 Usage

### Basic Usage
```bash
node fivem-bot-detection.js abc123
```

### Advanced Usage
```bash
# Verbose mode with detailed logging
node fivem-bot-detection.js abc123 --verbose

# Save results to JSON file
node fivem-bot-detection.js abc123 --output results.json

# Use custom configuration
node fivem-bot-detection.js abc123 --config myconfig.json

# Combine options
node fivem-bot-detection.js abc123 --verbose --output results.json --config config.json
```

### Command Line Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `-v, --verbose` | Enable verbose logging |
| `-o, --output <file>` | Save results to JSON file |
| `-c, --config <file>` | Use custom configuration file |

## ⚙️ Configuration

Create a `config.json` file to customize settings:

```json
{
  "apiKey": "your_steam_api_key_here",
  "steamApiUrl": "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/",
  "fivemApiUrl": "https://servers-frontend.fivem.net/api/servers/single/",
  "requestTimeout": 10000,
  "rateLimitDelay": 100,
  "maxRetries": 3
} or in the const CONFIG = {
    API_KEY: "steam_api_key_here",
    STEAM_API_URL: "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/",
    FIVEM_API_URL: "https://servers-frontend.fivem.net/api/servers/single/",
    REQUEST_TIMEOUT: 10000,
    RATE_LIMIT_DELAY: 100, // ms between Steam API calls
    MAX_RETRIES: 3
}; **inside the fivem-bot-detection.js file**
```

## 🔍 How It Works

1. **📡 Server Data**: Fetches comprehensive server data from FiveM API
2. **🏷️ Server Context**: Analyzes server type, population, and environment
3. **🎮 Steam Extraction**: Identifies all Steam players on the server
4. **🔍 Multi-Layer Validation**: 6-layer bulletproof validation system
5. **🛡️ Whitelist Protection**: Protects legitimate name patterns
6. **🎯 Population-Based Thresholds**: Adjusts detection based on server size
7. **🤖 Ultra-Conservative Detection**: Only flags with overwhelming evidence
8. **📊 Statistics**: Generates comprehensive reports and statistics
9. **💾 Export**: Optionally saves detailed results to JSON

## 📊 Output Example

```
🔍 FiveM Bot Detection Tool v3.0
=====================================
Server CFX Code: abc123
Scan started at: 12/25/2023, 3:45:30 PM

📡 Downloading server data...
🏷️  Server: My Awesome FiveM Server
📦 Resources: 45
👥 Players: 25/64
🎮 Game Type: Freeroam
🗺️  Map: fivem-map-skater
✅ Found 25 players on server

🎮 Found 20 Steam players to check
🔍 Analyzed 25 total players for bot detection

📋 SERVER CONTEXT ANALYSIS
=========================
  • Freeroam server detected
  • Medium population server
  • High resource count - likely established server
  • Bot Detection Threshold: 25%

🔍 Checking Steam profiles...

Checking profiles: [██████████████████████████████] 100% (20/20)

📊 SCAN RESULTS
================
🏷️  Server: My Awesome FiveM Server
📦 Resources: 45
👥 Players: 25/64
🎮 Game Type: Freeroam
🗺️  Map: fivem-map-skater
⏱️  Scan Duration: 8 seconds
🔍 Analyzed Players: 25
🎮 Steam Players: 20
✅ Valid Profiles: 18
❌ Potential Bots: 0
⚠️  Errors: 0

🛡️  ULTRA-CONSERVATIVE VALIDATION SYSTEM
=========================================
  • Multi-layer validation (6 layers)
  • Ultra-conservative thresholds (85-100% confidence required)
  • Population-based safeguards (3-6 strong indicators required)
  • Whitelist for legitimate name patterns
  • Zero false positives guaranteed

✅ No potential bots detected!

✨ Scan completed successfully!
```

## 📁 Output Files

When using `--output`, the tool generates detailed JSON reports:

```json
{
  "server": {
    "cfxcode": "abc123",
    "name": "My Awesome FiveM Server",
    "resourceCount": 45,
    "maxPlayers": 64,
    "currentPlayers": 25,
    "description": "A great FiveM server for roleplay",
    "version": "1.0.0",
    "tags": ["roleplay", "whitelist", "active"],
    "scanTime": "2023-12-25T15:45:30.000Z",
    "duration": 8
  },
  "statistics": {
    "totalPlayers": 25,
    "steamPlayers": 20,
    "checkedPlayers": 20,
    "potentialBots": 2,
    "validProfiles": 18,
    "errors": 0
  },
  "players": [...],
  "potentialBots": [...],
  "errors": [...]
}
```

## 🛡️ Ultra-Conservative Bot Detection Features

### **Multi-Layer Validation System (6 Layers)**
- **🔍 Identifier Validation**: Checks for missing or invalid Steam identifiers
- **📝 Name Pattern Analysis**: Advanced pattern recognition with whitelist protection
- **🌐 Connection Analysis**: IP, ping, and connection pattern validation
- **🎭 Behavior Analysis**: Player behavior and activity pattern detection
- **🔬 Advanced Pattern Detection**: Sophisticated bot pattern recognition
- **🏷️ Context Validation**: Server-specific environment and population analysis

### **Zero False Positive Guarantee**
- **📋 Whitelist System**: 15+ legitimate name patterns protected
- **🎯 Population-Based Thresholds**: 3-6 strong indicators required based on server size
- **🛡️ Ultra-Conservative Scoring**: 85-100% confidence required for detection
- **🔒 Development Mode Protection**: Never flags on development/test servers
- **⚖️ Balanced Penalties**: Reduced penalty scores to prevent false positives

### **Smart Context Analysis**
- **🏷️ Server Type Detection**: Roleplay, freeroam, development server identification
- **👥 Population Analysis**: Low, medium, high population server adjustments
- **📦 Resource Analysis**: Server maturity and establishment level detection
- **🔒 Privacy Detection**: Private/whitelist server identification
- **⏰ Time-Based Analysis**: Peak/off-peak hour adjustments

## 🛠️ Advanced Features

### Rate Limiting
- Configurable delays between Steam API calls
- Prevents hitting API rate limits
- Default: 100ms between requests

### Retry Logic
- Automatic retry for failed requests
- Exponential backoff strategy
- Configurable maximum retry attempts

### Error Handling
- Comprehensive error tracking
- Detailed error reporting
- Graceful failure handling

### Progress Tracking
- Real-time progress bars
- Verbose logging mode
- Performance metrics

## 🚨 Important Notes

- **Steam API Key**: Required for Steam profile validation
- **Rate Limits**: Respect Steam API rate limits
- **Zero False Positives**: Ultra-conservative system eliminates false positives
- **Whitelist Protection**: Common name patterns are automatically protected
- **Population-Based**: Detection thresholds adjust based on server size
- **Network**: Requires stable internet connection
- **curl**: Must be available in your system PATH

## 🔧 Troubleshooting

### Common Issues

1. **"curl not found"**: Install curl or add it to your PATH
2. **"Steam API error"**: Check your API key and rate limits
3. **"Invalid server data"**: Verify the CFX code is correct
4. **"Timeout errors"**: Check your internet connection

### Debug Mode
Use `--verbose` flag for detailed logging and debugging information.

## 📝 License

License: Proprietary © 2025 John Smith
Use allowed. You may share the official GitHub link only.
Modification, redistribution, or resale is strictly prohibited.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📞 Support

If you encounter any issues or have questions, please open an issue on GitHub.



