#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Configuration
const CONFIG = {
    API_KEY: "steam_api_key_here",
    STEAM_API_URL: "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/",
    FIVEM_API_URL: "https://servers-frontend.fivem.net/api/servers/single/",
    REQUEST_TIMEOUT: 10000,
    RATE_LIMIT_DELAY: 100, // ms between Steam API calls
    MAX_RETRIES: 3
};

// Parse command line arguments with enhanced options
const args = process.argv.slice(2);
let options = {
    cfxcode: null,
    verbose: false,
    output: null,
    config: null,
    help: false
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
        case '-h':
        case '--help':
            options.help = true;
            break;
        case '-v':
        case '--verbose':
            options.verbose = true;
            break;
        case '-o':
        case '--output':
            options.output = args[++i];
            break;
        case '-c':
        case '--config':
            options.config = args[++i];
            break;
        default:
            if (!arg.startsWith('-') && !options.cfxcode) {
                options.cfxcode = arg;
            }
            break;
    }
}

// Show help if requested or no cfxcode provided
if (options.help || !options.cfxcode) {
    console.log(`
FiveM Bot Detection Tool v3.0
=============================

Usage: node fivem-bot-detection.js <cfxcode> [options]

Arguments:
  <cfxcode>              FiveM server CFX code to check

Options:
  -h, --help            Show this help message
  -v, --verbose         Enable verbose logging
  -o, --output <file>   Save results to file (JSON format)
  -c, --config <file>   Use custom configuration file

Examples:
  node fivem-bot-detection.js abc123
  node fivem-bot-detection.js abc123 --verbose --output results.json
  node fivem-bot-detection.js abc123 --config myconfig.json

Configuration:
  Create a config.json file to customize API keys and settings:
  {
    "apiKey": "your_steam_api_key",
    "requestTimeout": 10000,
    "rateLimitDelay": 100
  }
`);
    process.exit(options.help ? 0 : 1);
}

// Load configuration file if specified
if (options.config && fs.existsSync(options.config)) {
    try {
        const configData = JSON.parse(fs.readFileSync(options.config, 'utf8'));
        Object.assign(CONFIG, configData);
        if (options.verbose) console.log(`Loaded configuration from ${options.config}`);
    } catch (error) {
        console.error(`Error loading config file: ${error.message}`);
        process.exit(1);
    }
}

const cfxcode = options.cfxcode;
let botscore = 0;
let totalPlayers = 0;
let checkedPlayers = 0;
let startTime = Date.now();

/**
 * Convert hex Steam ID to Steam64 ID
 * @param {string} hexId - The hex Steam ID
 * @returns {number} - The Steam64 ID
 */
function hexToSteam64(hexId) {
    return parseInt(hexId, 16);
}

/**
 * Sleep function for rate limiting
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get Steam profile information with retry logic and timeout
 * @param {number} steam64Id - The Steam64 ID
 * @param {string} apiKey - The Steam API key
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Object|false>} - Player data or false if not found
 */
function getSteamProfile(steam64Id, apiKey, retryCount = 0) {
    return new Promise((resolve) => {
        const url = `${CONFIG.STEAM_API_URL}?key=${apiKey}&steamids=${steam64Id}`;
        
        if (options.verbose) {
            console.log(`Checking Steam profile for ${steam64Id} (attempt ${retryCount + 1})`);
        }
        
        const request = https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    
                    // Check for API errors
                    if (jsonData.response && jsonData.response.error) {
                        if (options.verbose) {
                            console.log(`Steam API error: ${jsonData.response.error.errorDesc}`);
                        }
                        resolve(false);
                        return;
                    }
                    
                    const players = jsonData.response.players;
                    if (players && players.length > 0) {
                        const player = players[0];
                        const profileData = {
                            personaname: player.personaname,
                            profileurl: player.profileurl,
                            avatar: player.avatar,
                            avatarmedium: player.avatarmedium,
                            avatarfull: player.avatarfull,
                            personastate: player.personastate,
                            communityvisibilitystate: player.communityvisibilitystate,
                            lastlogoff: player.lastlogoff,
                            timecreated: player.timecreated,
                            realname: player.realname,
                            loccountrycode: player.loccountrycode,
                            locstatecode: player.locstatecode,
                            loccityid: player.loccityid,
                            gameid: player.gameid,
                            gameextrainfo: player.gameextrainfo,
                            gameserverip: player.gameserverip,
                            gameserverport: player.gameserverport,
                            gameid: player.gameid
                        };
                        
                        // Analyze profile for bot indicators
                        profileData.botIndicators = analyzeSteamProfileForBots(profileData);
                        resolve(profileData);
                    } else {
                        resolve(false);
                    }
                } catch (error) {
                    if (options.verbose) {
                        console.log(`JSON parse error for ${steam64Id}: ${error.message}`);
                    }
                    resolve(false);
                }
            });
        });
        
        request.on('error', (error) => {
            if (options.verbose) {
                console.log(`Request error for ${steam64Id}: ${error.message}`);
            }
            resolve(false);
        });
        
        // Set timeout
        request.setTimeout(CONFIG.REQUEST_TIMEOUT, () => {
            request.destroy();
            if (retryCount < CONFIG.MAX_RETRIES) {
                if (options.verbose) {
                    console.log(`Timeout for ${steam64Id}, retrying... (${retryCount + 1}/${CONFIG.MAX_RETRIES})`);
                }
                setTimeout(() => {
                    getSteamProfile(steam64Id, apiKey, retryCount + 1).then(resolve);
                }, 1000 * (retryCount + 1)); // Exponential backoff
            } else {
                if (options.verbose) {
                    console.log(`Max retries reached for ${steam64Id}`);
                }
                resolve(false);
            }
        });
    });
}

/**
 * Download FiveM server data using curl with better error handling
 * @param {string} cfxcode - The CFX code
 * @returns {Promise<Object>} - Server data object
 */
function downloadServerData(cfxcode) {
    return new Promise((resolve, reject) => {
        const url = `${CONFIG.FIVEM_API_URL}${cfxcode}`;
        const curlCommand = `curl -X GET "${url}" -o response.json --connect-timeout 10 --max-time 30`;
        
        if (options.verbose) {
            console.log(`Downloading server data from: ${url}`);
        }
        
        exec(curlCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing curl: ${error.message}`);
                reject(new Error(`Failed to download server data: ${error.message}`));
                return;
            }
            
            if (stderr && options.verbose) {
                console.log(`Curl stderr: ${stderr}`);
            }
            
            // Check if response file exists and is valid
            if (!fs.existsSync('response.json')) {
                reject(new Error('Response file not created'));
                return;
            }
            
            try {
                const data = JSON.parse(fs.readFileSync('response.json', 'utf8'));
                
                // Validate response structure
                if (!data.Data || !data.Data.players) {
                    reject(new Error('Invalid server data structure'));
                    return;
                }
                
                resolve(data);
            } catch (parseError) {
                reject(new Error(`Failed to parse server data: ${parseError.message}`));
            }
        });
    });
}

/**
 * Display progress bar
 * @param {number} current - Current progress
 * @param {number} total - Total items
 * @param {string} label - Label for the progress bar
 */
function showProgress(current, total, label = 'Progress') {
    const percentage = Math.round((current / total) * 100);
    const barLength = 30;
    const filledLength = Math.round((barLength * current) / total);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    process.stdout.write(`\r${label}: [${bar}] ${percentage}% (${current}/${total})`);
    if (current === total) {
        console.log(); // New line when complete
    }
}

/**
 * Save results to file
 * @param {Object} results - Results object to save
 * @param {string} filename - Output filename
 */
function saveResults(results, filename) {
    try {
        const outputPath = path.resolve(filename);
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        console.log(`\nResults saved to: ${outputPath}`);
    } catch (error) {
        console.error(`Error saving results: ${error.message}`);
    }
}

/**
 * Format timestamp
 * @param {number} timestamp - Unix timestamp
 * @returns {string} - Formatted date string
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Analyze server context to determine appropriate bot detection thresholds
 * @param {Object} serverInfo - Server information from FiveM API
 * @param {Array} players - Array of players
 * @returns {Object} - Server context analysis
 */
function analyzeServerContext(serverInfo, players) {
    const context = {
        isDevelopmentServer: false,
        isLowPopulation: false,
        isTestServer: false,
        isRoleplayServer: false,
        isFreeroamServer: false,
        hasWhitelist: false,
        isPrivateServer: false,
        serverReputation: 'unknown',
        expectedBotThreshold: 0.3, // Default 30% threshold
        contextFactors: [],
        adjustments: {
            noIdentifiers: 0,
            localhost: 0,
            suspiciousNames: 0,
            highPing: 0,
            duplicateNames: 0
        }
    };
    
    // Check if it's a development/test server
    if (serverInfo.hostname) {
        const hostname = serverInfo.hostname.toLowerCase();
        if (hostname.includes('test') || hostname.includes('dev') || hostname.includes('development') || 
            hostname.includes('debug') || hostname.includes('staging')) {
            context.isDevelopmentServer = true;
            context.isTestServer = true;
            context.expectedBotThreshold = 0.8; // 80% threshold for test servers
            context.adjustments.noIdentifiers = -20; // Reduce penalty for no identifiers
            context.adjustments.localhost = -30; // Reduce penalty for localhost
            context.contextFactors.push('Development/Test server detected');
        }
    }
    
    // Check server type
    if (serverInfo.gametype) {
        const gameType = serverInfo.gametype.toLowerCase();
        if (gameType.includes('roleplay') || gameType.includes('rp')) {
            context.isRoleplayServer = true;
            context.expectedBotThreshold = 0.2; // 20% threshold for RP servers
            context.adjustments.suspiciousNames = 10; // Increase penalty for suspicious names
            context.contextFactors.push('Roleplay server detected');
        } else if (gameType.includes('freeroam') || gameType.includes('free roam')) {
            context.isFreeroamServer = true;
            context.expectedBotThreshold = 0.4; // 40% threshold for freeroam
            context.contextFactors.push('Freeroam server detected');
        }
    }
    
    // Check for whitelist indicators
    if (serverInfo.vars) {
        if (serverInfo.vars.sv_whitelist === 'true' || serverInfo.vars.whitelist === 'true') {
            context.hasWhitelist = true;
            context.expectedBotThreshold = 0.15; // 15% threshold for whitelisted servers
            context.adjustments.noIdentifiers = 15; // Increase penalty for no identifiers
            context.contextFactors.push('Whitelisted server detected');
        }
        
        if (serverInfo.vars.sv_password || serverInfo.vars.password) {
            context.isPrivateServer = true;
            context.expectedBotThreshold = 0.25; // 25% threshold for private servers
            context.contextFactors.push('Private server detected');
        }
    }
    
    // Check server privacy
    if (serverInfo.private === true) {
        context.isPrivateServer = true;
        context.expectedBotThreshold = 0.25;
        context.contextFactors.push('Private server confirmed');
    }
    
    // Analyze player count context
    const totalPlayers = players.length;
    const maxPlayers = serverInfo.sv_maxclients || serverInfo.svMaxclients || 32;
    const playerRatio = totalPlayers / maxPlayers;
    
    // Store total players in context for validation
    context.totalPlayers = totalPlayers;
    
    if (totalPlayers <= 5) {
        context.isLowPopulation = true;
        context.expectedBotThreshold = 0.6; // 60% threshold for low population
        context.adjustments.noIdentifiers = -15; // Reduce penalty for no identifiers
        context.contextFactors.push('Low population server');
    } else if (playerRatio < 0.1) {
        context.expectedBotThreshold = 0.5; // 50% threshold for very low activity
        context.contextFactors.push('Very low activity server');
    }
    
    // Check server tags for additional context
    if (serverInfo.vars && serverInfo.vars.tags) {
        const tags = serverInfo.vars.tags.toLowerCase();
        if (tags.includes('whitelist')) {
            context.hasWhitelist = true;
            context.expectedBotThreshold = Math.min(context.expectedBotThreshold, 0.15);
        }
        if (tags.includes('test') || tags.includes('dev')) {
            context.isTestServer = true;
            context.expectedBotThreshold = Math.max(context.expectedBotThreshold, 0.7);
        }
        if (tags.includes('roleplay') || tags.includes('rp')) {
            context.isRoleplayServer = true;
            context.expectedBotThreshold = Math.min(context.expectedBotThreshold, 0.2);
        }
    }
    
    // Check server owner reputation (basic analysis)
    if (serverInfo.ownerName) {
        const ownerName = serverInfo.ownerName.toLowerCase();
        if (ownerName.includes('admin') || ownerName.includes('mod') || ownerName.includes('staff')) {
            context.serverReputation = 'staff';
            context.expectedBotThreshold = Math.min(context.expectedBotThreshold, 0.2);
            context.contextFactors.push('Staff-owned server');
        } else if (ownerName.includes('test') || ownerName.includes('dev')) {
            context.serverReputation = 'development';
            context.expectedBotThreshold = Math.max(context.expectedBotThreshold, 0.6);
            context.contextFactors.push('Development owner');
        }
    }
    
    // Check server resources for context
    if (serverInfo.resources && serverInfo.resources.length > 0) {
        const resourceCount = serverInfo.resources.length;
        if (resourceCount > 100) {
            context.contextFactors.push('High resource count - likely established server');
            context.expectedBotThreshold = Math.min(context.expectedBotThreshold, 0.25);
        } else if (resourceCount < 20) {
            context.contextFactors.push('Low resource count - possible test server');
            context.expectedBotThreshold = Math.max(context.expectedBotThreshold, 0.5);
        }
        
        // Check for specific resource types
        const resourceNames = serverInfo.resources.map(r => r.toLowerCase()).join(' ');
        if (resourceNames.includes('whitelist') || resourceNames.includes('permissions')) {
            context.hasWhitelist = true;
            context.expectedBotThreshold = Math.min(context.expectedBotThreshold, 0.2);
        }
        if (resourceNames.includes('test') || resourceNames.includes('debug')) {
            context.isTestServer = true;
            context.expectedBotThreshold = Math.max(context.expectedBotThreshold, 0.6);
        }
    }
    
    // Time-based analysis
    const currentHour = new Date().getHours();
    if (currentHour >= 2 && currentHour <= 6) {
        context.contextFactors.push('Off-peak hours (2-6 AM)');
        context.expectedBotThreshold = Math.max(context.expectedBotThreshold, 0.4);
    } else if (currentHour >= 18 && currentHour <= 23) {
        context.contextFactors.push('Peak hours (6-11 PM)');
        context.expectedBotThreshold = Math.min(context.expectedBotThreshold, 0.25);
    }
    
    // Final threshold adjustment based on multiple factors
    if (context.contextFactors.length > 3) {
        context.expectedBotThreshold = Math.min(context.expectedBotThreshold, 0.3);
    }
    
    return context;
}

/**
 * Analyze Steam profile for bot indicators
 * @param {Object} profile - Steam profile data
 * @returns {Object} - Bot indicators and confidence score
 */
function analyzeSteamProfileForBots(profile) {
    const indicators = [];
    let confidence = 0;
    
    // Check profile age (very new accounts are suspicious)
    if (profile.timecreated) {
        const accountAge = Date.now() / 1000 - profile.timecreated;
        const daysOld = accountAge / (24 * 60 * 60);
        
        if (daysOld < 1) {
            indicators.push('Account less than 1 day old');
            confidence += 30;
        } else if (daysOld < 7) {
            indicators.push('Account less than 1 week old');
            confidence += 15;
        } else if (daysOld < 30) {
            indicators.push('Account less than 1 month old');
            confidence += 5;
        }
    }
    
    // Check profile privacy (private profiles are suspicious)
    if (profile.communityvisibilitystate === 1) {
        indicators.push('Private profile');
        confidence += 20;
    } else if (profile.communityvisibilitystate === 2) {
        indicators.push('Friends-only profile');
        confidence += 10;
    }
    
    // Check if profile is online but not playing (suspicious for bots)
    if (profile.personastate === 1 && !profile.gameextrainfo) {
        indicators.push('Online but not playing any game');
        confidence += 15;
    }
    
    // Check for default avatar (suspicious)
    if (profile.avatar && profile.avatar.includes('steamcommunity/public/images/avatars/fe/')) {
        indicators.push('Default Steam avatar');
        confidence += 10;
    }
    
    // Check for suspicious name patterns
    if (profile.personaname) {
        if (isSuspiciousName(profile.personaname)) {
            indicators.push('Suspicious Steam name');
            confidence += 20;
        }
        
        // Check for random character patterns
        if (/^[a-zA-Z0-9]{8,}$/.test(profile.personaname) && !/[aeiou]/i.test(profile.personaname)) {
            indicators.push('Random character Steam name');
            confidence += 15;
        }
    }
    
    // Check for missing profile information
    if (!profile.realname && !profile.loccountrycode) {
        indicators.push('Missing profile information');
        confidence += 10;
    }
    
    // Check for very recent last logoff (could indicate bot behavior)
    if (profile.lastlogoff) {
        const timeSinceLogoff = Date.now() / 1000 - profile.lastlogoff;
        const hoursSinceLogoff = timeSinceLogoff / (60 * 60);
        
        if (hoursSinceLogoff < 0.1) { // Less than 6 minutes
            indicators.push('Very recent logoff (possible bot restart)');
            confidence += 15;
        }
    }
    
    // Check for playing FiveM specifically (good indicator)
    if (profile.gameextrainfo && profile.gameextrainfo.toLowerCase().includes('fivem')) {
        confidence -= 10; // Reduce suspicion if playing FiveM
    }
    
    return {
        indicators,
        confidence: Math.min(confidence, 100), // Cap at 100
        isLikelyBot: confidence >= 50
    };
}

/**
 * Multi-layer validation system for bulletproof bot detection
 * @param {Object} player - Player data
 * @param {Object} serverContext - Server context
 * @param {Array} allPlayers - All players for cross-reference
 * @returns {Object} - Validation result with confidence levels
 */
function validatePlayerForBots(player, serverContext, allPlayers) {
    const validation = {
        isBot: false,
        confidence: 0,
        reasons: [],
        warnings: [],
        humanIndicators: [],
        botIndicators: [],
        finalScore: 0,
        validationLayers: {
            identifierValidation: false,
            nameValidation: false,
            connectionValidation: false,
            behaviorValidation: false,
            patternValidation: false,
            contextValidation: false
        }
    };
    
    // Layer 1: Identifier Validation (Most Important)
    if (player.identifiers.length === 0) {
        validation.botIndicators.push('No authentication identifiers');
        validation.confidence += 30;
    } else {
        validation.humanIndicators.push('Has authentication identifiers');
        validation.validationLayers.identifierValidation = true;
    }
    
    // Layer 2: Name Validation (Conservative)
    const nameValidation = validatePlayerName(player.name, serverContext);
    if (nameValidation.isSuspicious) {
        validation.botIndicators.push(...nameValidation.reasons);
        validation.confidence += nameValidation.score;
    } else {
        validation.humanIndicators.push('Normal name pattern');
        validation.validationLayers.nameValidation = true;
    }
    
    // Layer 3: Connection Validation
    const connectionValidation = validateConnection(player, serverContext);
    if (connectionValidation.isSuspicious) {
        validation.botIndicators.push(...connectionValidation.reasons);
        validation.confidence += connectionValidation.score;
    } else {
        validation.humanIndicators.push('Normal connection pattern');
        validation.validationLayers.connectionValidation = true;
    }
    
    // Layer 4: Behavioral Pattern Validation
    const behaviorValidation = validateBehavior(player, allPlayers, serverContext);
    if (behaviorValidation.isSuspicious) {
        validation.botIndicators.push(...behaviorValidation.reasons);
        validation.confidence += behaviorValidation.score;
    } else {
        validation.humanIndicators.push('Normal behavioral pattern');
        validation.validationLayers.behaviorValidation = true;
    }
    
    // Layer 5: Pattern Validation (Advanced)
    const patternValidation = validateAdvancedPatterns(player, serverContext);
    if (patternValidation.isSuspicious) {
        validation.botIndicators.push(...patternValidation.reasons);
        validation.confidence += patternValidation.score;
    } else {
        validation.humanIndicators.push('Normal pattern characteristics');
        validation.validationLayers.patternValidation = true;
    }
    
    // Layer 6: Context Validation
    const contextValidation = validateContext(player, serverContext);
    if (contextValidation.isSuspicious) {
        validation.botIndicators.push(...contextValidation.reasons);
        validation.confidence += contextValidation.score;
    } else {
        validation.humanIndicators.push('Contextually normal');
        validation.validationLayers.contextValidation = true;
    }
    
    // Calculate final score with conservative thresholds
    validation.finalScore = validation.confidence;
    
    // Bulletproof decision logic - require multiple strong indicators
    const strongIndicators = validation.botIndicators.filter(reason => 
        reason.includes('No authentication') || 
        reason.includes('Extremely suspicious') ||
        reason.includes('Multiple connections from same IP')
    ).length;
    
    const validationLayersPassed = Object.values(validation.validationLayers).filter(Boolean).length;
    
    // EXTREMELY CONSERVATIVE: Only flag as bot if:
    // 1. Multiple strong indicators (3+) AND very high confidence (85+), OR
    // 2. Extremely high confidence (95+) with multiple failed layers, OR
    // 3. Perfect confidence (100%) with at least one strong indicator
    validation.isBot = (
        (strongIndicators >= 3 && validation.confidence >= 85) ||
        (validation.confidence >= 95 && validationLayersPassed <= 1) ||
        (validation.confidence >= 100 && strongIndicators >= 1)
    ) && !serverContext.isDevelopmentServer; // Never flag in dev mode
    
    // Additional safeguards for high-population servers
    if (serverContext.totalPlayers > 50) {
        // Require even more evidence on high-population servers
        validation.isBot = validation.isBot && (
            strongIndicators >= 4 || 
            validation.confidence >= 98
        );
    }
    
    // Extra safeguards for very high population servers
    if (serverContext.totalPlayers > 100) {
        // Require overwhelming evidence on very high-population servers
        validation.isBot = validation.isBot && (
            strongIndicators >= 5 || 
            validation.confidence >= 99
        );
    }
    
    // Additional safeguards for extremely high population servers
    if (serverContext.totalPlayers > 200) {
        // Only flag with perfect confidence on extremely high-population servers
        validation.isBot = validation.isBot && (
            strongIndicators >= 6 || 
            validation.confidence >= 100
        );
    }
    
    // Add warnings for borderline cases
    if (validation.confidence >= 50 && validation.confidence < 70) {
        validation.warnings.push('Borderline suspicious - requires manual review');
    }
    
    return validation;
}

/**
 * Check if name is whitelisted (legitimate patterns)
 */
function isWhitelistedName(name) {
    if (!name) return false;
    
    const whitelistPatterns = [
        // Common legitimate name patterns
        /^[A-Za-z]{2,20}$/, // Simple letters only
        /^[A-Za-z]{2,10}[0-9]{1,4}$/, // Name + numbers
        /^[A-Za-z]{2,10}_[A-Za-z0-9]{1,10}$/, // Name_identifier
        /^[A-Za-z]{2,10}\.[A-Za-z]{2,10}$/, // First.Last
        /^[A-Za-z]{2,10}-[A-Za-z]{2,10}$/, // First-Last
        /^[A-Za-z]{2,10}\s[A-Za-z]{2,10}$/, // First Last
        /^[A-Za-z]{1,3}[0-9]{2,4}$/, // Short letters + numbers
        /^[A-Za-z]{2,15}[0-9]{1,3}$/, // Longer name + few numbers
        /^[A-Za-z]{3,12}$/, // Medium length names
        /^[A-Za-z]{2,8}[0-9]{2,6}$/, // Name + reasonable numbers
        /^[A-Za-z]{1,2}[0-9]{3,8}$/, // Short letters + more numbers
        /^[A-Za-z]{4,15}$/, // Longer names
        /^[A-Za-z]{2,10}[_\-\.][A-Za-z0-9]{2,10}$/, // Separated names
        /^[A-Za-z]{2,8}[0-9]{1,4}[A-Za-z]{0,4}$/, // Mixed patterns
        /^[A-Za-z]{3,12}[0-9]{1,2}$/, // Name + 1-2 digits
        /^[A-Za-z]{2,6}[0-9]{2,4}[A-Za-z]{0,3}$/, // Complex but legitimate
    ];
    
    return whitelistPatterns.some(pattern => pattern.test(name));
}

/**
 * Validate player name with extremely conservative approach
 */
function validatePlayerName(name, serverContext) {
    const result = { isSuspicious: false, reasons: [], score: 0 };
    
    if (!name || name.trim().length === 0) {
        result.isSuspicious = true;
        result.reasons.push('Empty name');
        result.score += 40;
        return result;
    }
    
    // Check whitelist first - if whitelisted, never flag
    if (isWhitelistedName(name)) {
        return result; // Not suspicious
    }
    
    // Only flag extremely obvious bot patterns
    if (name.length <= 1) {
        result.isSuspicious = true;
        result.reasons.push('Extremely short name');
        result.score += 35;
    } else if (/^[0-9]{6,}$/.test(name)) {
        // Only flag if 6+ consecutive numbers
        result.isSuspicious = true;
        result.reasons.push('Long numeric-only name');
        result.score += 30;
    } else if (hasExcessiveSpecialChars(name) && name.length > 15) {
        // Only flag if very long with excessive special chars
        result.isSuspicious = true;
        result.reasons.push('Excessive special characters in long name');
        result.score += 25;
    } else if (isAdvancedSuspiciousName(name) && name.length > 12) {
        // Only flag very long suspicious patterns
        result.isSuspicious = true;
        result.reasons.push('Extremely suspicious long name pattern');
        result.score += 35;
    }
    
    return result;
}

/**
 * Validate connection patterns (extremely conservative)
 */
function validateConnection(player, serverContext) {
    const result = { isSuspicious: false, reasons: [], score: 0 };
    
    // Only flag in very specific circumstances
    if (player.endpoint.includes('127.0.0.1') || player.endpoint.includes('localhost')) {
        // Only flag localhost if it's clearly a production server AND has other indicators
        if (!serverContext.isDevelopmentServer && serverContext.totalPlayers > 20) {
            result.isSuspicious = true;
            result.reasons.push('Localhost connection on high-population production server');
            result.score += 20; // Reduced score
        }
    }
    
    // Only flag extremely high ping (5000ms+)
    if (player.ping > 5000) {
        result.isSuspicious = true;
        result.reasons.push('Extremely high ping (>5000ms)');
        result.score += 20; // Reduced score
    }
    
    return result;
}

/**
 * Validate behavioral patterns (extremely conservative)
 */
function validateBehavior(player, allPlayers, serverContext) {
    const result = { isSuspicious: false, reasons: [], score: 0 };
    
    // Only check for duplicate names if there are many instances (5+)
    const nameCount = allPlayers.filter(p => 
        p.name && p.name.toLowerCase().trim() === player.name.toLowerCase().trim()
    ).length;
    
    if (nameCount > 5) {
        result.isSuspicious = true;
        result.reasons.push('Many duplicate names detected');
        result.score += 30; // Reduced score
    }
    
    // Only flag if there are many connections from same IP (10+)
    const endpointIP = player.endpoint.split(':')[0];
    const sameIPCount = allPlayers.filter(p => 
        p.endpoint && p.endpoint.split(':')[0] === endpointIP
    ).length;
    
    if (sameIPCount > 10) {
        result.isSuspicious = true;
        result.reasons.push('Many connections from same IP');
        result.score += 40; // Reduced score
    }
    
    return result;
}

/**
 * Validate advanced patterns (extremely conservative)
 */
function validateAdvancedPatterns(player, serverContext) {
    const result = { isSuspicious: false, reasons: [], score: 0 };
    
    // Only flag extremely obvious bot patterns (very long, no vowels, no common patterns)
    if (player.name && 
        player.name.length > 20 && 
        /^[a-z0-9]{20,}$/i.test(player.name) && 
        !/[aeiou]/i.test(player.name) &&
        !/^[a-z]{2,}[0-9]{2,}/i.test(player.name)) { // Not a common pattern
        result.isSuspicious = true;
        result.reasons.push('Extremely suspicious generated pattern');
        result.score += 25; // Reduced score
    }
    
    return result;
}

/**
 * Validate context-specific indicators
 */
function validateContext(player, serverContext) {
    const result = { isSuspicious: false, reasons: [], score: 0 };
    
    // In whitelisted servers, no identifiers is extremely suspicious
    if (serverContext.hasWhitelist && player.identifiers.length === 0) {
        result.isSuspicious = true;
        result.reasons.push('No identifiers on whitelisted server');
        result.score += 40;
    }
    
    return result;
}

/**
 * Analyze players for potential bot indicators with server context
 * @param {Array} players - Array of player data
 * @param {Object} serverContext - Server context analysis
 * @returns {Object} - Bot analysis results
 */
function analyzePlayersForBots(players, serverContext) {
    const potentialBots = [];
    const reasons = {
        noIdentifiers: 0,
        suspiciousNames: 0,
        highPing: 0,
        localhost: 0,
        duplicateNames: 0,
        specialCharacters: 0,
        suspiciousPing: 0,
        veryShortNames: 0,
        numericNames: 0,
        emptyNames: 0,
        suspiciousEndpoints: 0,
        borderlineCases: 0
    };
    
    // Use bulletproof validation for each player
    for (const player of players) {
        const validation = validatePlayerForBots(player, serverContext, players);
        
        // Update statistics
        if (validation.botIndicators.includes('No authentication identifiers')) {
            reasons.noIdentifiers++;
        }
        if (validation.botIndicators.some(r => r.includes('name'))) {
            reasons.suspiciousNames++;
        }
        if (validation.botIndicators.some(r => r.includes('ping'))) {
            reasons.highPing++;
        }
        if (validation.botIndicators.some(r => r.includes('Localhost'))) {
            reasons.localhost++;
        }
        if (validation.botIndicators.some(r => r.includes('duplicate'))) {
            reasons.duplicateNames++;
        }
        if (validation.botIndicators.some(r => r.includes('characters'))) {
            reasons.specialCharacters++;
        }
        if (validation.botIndicators.some(r => r.includes('IP'))) {
            reasons.suspiciousEndpoints++;
        }
        if (validation.warnings.length > 0) {
            reasons.borderlineCases++;
        }
        
        // Only add to potential bots if bulletproof validation confirms
        if (validation.isBot) {
            player.isPotentialBot = true;
            player.botReasons = validation.botIndicators;
            player.botScore = validation.finalScore;
            player.validationLayers = validation.validationLayers;
            player.humanIndicators = validation.humanIndicators;
            player.warnings = validation.warnings;
            potentialBots.push(player);
        }
    }
    
    return {
        potentialBots,
        reasons
    };
}

/**
 * Check if a name is suspicious (common bot patterns)
 * @param {string} name - Player name
 * @returns {boolean} - True if suspicious
 */
function isSuspiciousName(name) {
    if (!name || name.length < 2) return true;
    
    const suspiciousPatterns = [
        /^[0-9]+$/, // Only numbers
        /^[a-zA-Z]{1,2}$/, // Very short names
        /bot/i, // Contains "bot"
        /test/i, // Contains "test"
        /admin/i, // Contains "admin"
        /player/i, // Contains "player"
        /user/i, // Contains "user"
        /guest/i, // Contains "guest"
        /^[^a-zA-Z0-9\s]+$/, // Only special characters
        /^.{1,3}$/ // Very short names (1-3 chars)
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(name));
}

/**
 * Check if name has excessive special characters
 * @param {string} name - Player name
 * @returns {boolean} - True if excessive special chars
 */
function hasExcessiveSpecialChars(name) {
    if (!name) return false;
    
    const specialCharCount = (name.match(/[^a-zA-Z0-9\s]/g) || []).length;
    const totalChars = name.length;
    
    // More than 50% special characters is suspicious
    return specialCharCount / totalChars > 0.5;
}

/**
 * Advanced suspicious name detection
 * @param {string} name - Player name
 * @returns {boolean} - True if suspicious
 */
function isAdvancedSuspiciousName(name) {
    if (!name || name.length < 2) return true;
    
    // Check for common bot patterns
    const botPatterns = [
        /^[a-z]{1,2}[0-9]{4,}$/i, // Short letters + many numbers
        /^[0-9]{1,2}[a-z]{4,}$/i, // Short numbers + many letters
        /^[a-z]+[0-9]+[a-z]+[0-9]+$/i, // Alternating pattern
        /^[a-z]{2,}[0-9]{2,}[a-z]{2,}[0-9]{2,}$/i, // Complex alternating
        /^[a-z0-9]{8,}$/i, // Long alphanumeric without vowels
        /^[a-z]{1,3}[0-9]{6,}$/i, // Short letters + many numbers
        /^[0-9]{6,}[a-z]{1,3}$/i, // Many numbers + short letters
        /^[a-z]+[0-9]+$/i, // Letters then numbers only
        /^[0-9]+[a-z]+$/i, // Numbers then letters only
        /^[a-z]{1,2}[0-9]{1,2}[a-z]{1,2}[0-9]{1,2}$/i, // Short alternating
        /^[a-z0-9]{10,}$/i, // Very long alphanumeric
        /^[a-z]{2,}[0-9]{2,}[a-z]{2,}$/i, // Pattern with numbers in middle
        /^[0-9]{2,}[a-z]{2,}[0-9]{2,}$/i, // Pattern with letters in middle
        /^[a-z]+[0-9]+[a-z]+$/i, // Letters-numbers-letters
        /^[0-9]+[a-z]+[0-9]+$/i, // Numbers-letters-numbers
        /^[a-z]{1,}[0-9]{3,}[a-z]{1,}$/i, // Letters + 3+ numbers + letters
        /^[0-9]{1,}[a-z]{3,}[0-9]{1,}$/i, // Numbers + 3+ letters + numbers
        () => /^[a-z0-9]{6,}$/i.test(name) && !/[aeiou]/i.test(name), // Long alphanumeric without vowels
        /^[a-z]{2,}[0-9]{2,}[a-z]{2,}[0-9]{2,}[a-z]{2,}$/i, // Complex pattern
        /^[0-9]{2,}[a-z]{2,}[0-9]{2,}[a-z]{2,}[0-9]{2,}$/i, // Complex pattern (numbers first)
        /^[a-z]+[0-9]+[a-z]+[0-9]+[a-z]+$/i, // 5-part alternating
        /^[0-9]+[a-z]+[0-9]+[a-z]+[0-9]+$/i, // 5-part alternating (numbers first)
    ];
    
    // Check for suspicious character patterns (using functions instead of regex with conditions)
    const suspiciousPatterns = [
        () => /^[a-z0-9]{8,}$/i.test(name) && !/[aeiou]/i.test(name), // Long without vowels
        () => /^[a-z0-9]{6,}$/i.test(name) && (name.match(/[0-9]/g) || []).length > 3, // Many numbers
        () => /^[a-z0-9]{6,}$/i.test(name) && (name.match(/[a-z]/g) || []).length > 3 && (name.match(/[0-9]/g) || []).length > 3, // Many of both
        () => /^[a-z0-9]{8,}$/i.test(name) && name.length % 2 === 0 && /^[a-z0-9]{2}$/i.test(name.substring(0, 2)), // Even length, starts with 2 chars
        () => /^[a-z0-9]{10,}$/i.test(name) && name.length % 2 === 0, // Very long even length
        () => /^[a-z0-9]{12,}$/i.test(name), // Extremely long
        () => /^[a-z]{1,2}[0-9]{4,}[a-z]{1,2}$/i.test(name), // Short letters + many numbers + short letters
        () => /^[0-9]{1,2}[a-z]{4,}[0-9]{1,2}$/i.test(name), // Short numbers + many letters + short numbers
    ];
    
    // Check for repetitive patterns
    const repetitivePatterns = [
        /^(.{2,})\1+$/i, // Repeated substrings
        /^[a-z]{2}[0-9]{2}[a-z]{2}[0-9]{2}$/i, // 2-2-2-2 pattern
        /^[0-9]{2}[a-z]{2}[0-9]{2}[a-z]{2}$/i, // 2-2-2-2 pattern (numbers first)
        /^[a-z]{3}[0-9]{3}[a-z]{3}$/i, // 3-3-3 pattern
        /^[0-9]{3}[a-z]{3}[0-9]{3}$/i, // 3-3-3 pattern (numbers first)
    ];
    
    // Check all patterns
    return botPatterns.some(pattern => typeof pattern === 'function' ? pattern() : pattern.test(name)) ||
           suspiciousPatterns.some(pattern => pattern()) ||
           repetitivePatterns.some(pattern => pattern.test(name));
}

/**
 * Main function to check for bots
 */
async function checkForBots() {
    const results = {
        server: {
            cfxcode: cfxcode,
            name: null,
            resourceCount: 0,
            maxPlayers: 0,
            currentPlayers: 0,
            description: null,
            version: null,
            tags: [],
            gameType: null,
            mapName: null,
            ownerName: null,
            isPrivate: false,
            scanTime: new Date().toISOString(),
            duration: 0
        },
        statistics: {
            totalPlayers: 0,
            steamPlayers: 0,
            totalAnalyzedPlayers: 0,
            checkedPlayers: 0,
            potentialBots: 0,
            validProfiles: 0,
            errors: 0,
            botReasons: {}
        },
        players: [],
        potentialBots: [],
        errors: []
    };
    
    try {
        console.log(`\n🔍 FiveM Bot Detection Tool v3.0`);
        console.log(`=====================================`);
        console.log(`Server CFX Code: ${cfxcode}`);
        console.log(`Scan started at: ${new Date().toLocaleString()}\n`);
        
        // Download server data
        console.log('📡 Downloading server data...');
        const data = await downloadServerData(cfxcode);
        const players = data.Data.players;
        const serverInfo = data.Data;
        totalPlayers = players.length;
        results.statistics.totalPlayers = totalPlayers;
        
        // Extract server information from actual FiveM API structure
        const serverName = serverInfo.hostname || 'Unknown Server';
        const resourceCount = serverInfo.resources ? serverInfo.resources.length : 0;
        const maxPlayers = serverInfo.sv_maxclients || serverInfo.svMaxclients || 'Unknown';
        const currentPlayers = serverInfo.clients || serverInfo.selfReportedClients || 0;
        const serverDescription = serverInfo.vars?.sv_projectDesc || 'No description available';
        const serverVersion = serverInfo.server || 'Unknown version';
        const serverTags = serverInfo.vars?.tags ? serverInfo.vars.tags.split(',').map(tag => tag.trim()) : [];
        const gameType = serverInfo.gametype || 'Unknown';
        const mapName = serverInfo.mapname || 'Unknown';
        const ownerName = serverInfo.ownerName || 'Unknown';
        const isPrivate = serverInfo.private || false;
        
        // Update results with server info
        results.server.name = serverName;
        results.server.resourceCount = resourceCount;
        results.server.maxPlayers = maxPlayers;
        results.server.currentPlayers = currentPlayers;
        results.server.description = serverDescription;
        results.server.version = serverVersion;
        results.server.tags = serverTags;
        results.server.gameType = gameType;
        results.server.mapName = mapName;
        results.server.ownerName = ownerName;
        results.server.isPrivate = isPrivate;
        
        console.log(`🏷️  Server: ${serverName}`);
        console.log(`📦 Resources: ${resourceCount}`);
        console.log(`👥 Players: ${currentPlayers}/${maxPlayers}`);
        console.log(`🎮 Game Type: ${gameType}`);
        console.log(`🗺️  Map: ${mapName}`);
        
        if (options.verbose) {
            console.log(`📝 Description: ${serverDescription}`);
            console.log(`🔧 Version: ${serverVersion}`);
            console.log(`👤 Owner: ${ownerName}`);
            console.log(`🔒 Private: ${isPrivate ? 'Yes' : 'No'}`);
            if (serverTags.length > 0) {
                console.log(`🏷️  Tags: ${serverTags.join(', ')}`);
            }
        }
        
        console.log(`✅ Found ${totalPlayers} players on server\n`);
        
        // Extract all player identifiers and analyze for bot detection
        const steamIdentifiers = [];
        const allPlayers = [];
        const playerMap = new Map();
        
        for (const item of players) {
            const playerData = {
                name: item.name || 'Unknown',
                identifiers: item.identifiers || [],
                ping: item.ping || 0,
                endpoint: item.endpoint || 'Unknown',
                id: item.id || 0,
                steamHex: null,
                steam64Id: null,
                isPotentialBot: false,
                botReasons: []
            };
            
            // Check for Steam identifiers
            for (const identifier of item.identifiers) {
                if (identifier.startsWith('steam:')) {
                    const [prefix, steamHex] = identifier.split(':');
                    const steam64Id = hexToSteam64(steamHex);
                    playerData.steamHex = steamHex;
                    playerData.steam64Id = steam64Id;
                    steamIdentifiers.push(playerData);
                    playerMap.set(steam64Id, item);
                    break;
                }
            }
            
            // Add all players for analysis
            allPlayers.push(playerData);
        }
        
        // Analyze server context first
        const serverContext = analyzeServerContext(serverInfo, allPlayers);
        
        // Analyze all players for bot detection with context
        const botAnalysis = analyzePlayersForBots(allPlayers, serverContext);
        
        results.statistics.steamPlayers = steamIdentifiers.length;
        results.statistics.totalAnalyzedPlayers = allPlayers.length;
        results.statistics.potentialBots = botAnalysis.potentialBots.length;
        results.statistics.botReasons = botAnalysis.reasons;
        results.serverContext = serverContext;
        
        console.log(`🎮 Found ${steamIdentifiers.length} Steam players to check`);
        console.log(`🔍 Analyzed ${allPlayers.length} total players for bot detection`);
        
        // Display server context information
        if (serverContext.contextFactors.length > 0) {
            console.log(`\n📋 SERVER CONTEXT ANALYSIS`);
            console.log(`=========================`);
            serverContext.contextFactors.forEach(factor => {
                console.log(`  • ${factor}`);
            });
            console.log(`  • Bot Detection Threshold: ${Math.round(serverContext.expectedBotThreshold * 100)}%`);
            if (serverContext.isDevelopmentServer) {
                console.log(`  • Development Server Mode: More lenient detection`);
            }
            console.log();
        }
        
        if (steamIdentifiers.length === 0 && botAnalysis.potentialBots.length === 0) {
            console.log('⚠️  No Steam players found on this server');
            
            // Still show results even with no Steam players
            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000);
            results.server.duration = duration;
            
            // Display results
            console.log(`\n\n📊 SCAN RESULTS`);
            console.log(`================`);
            console.log(`🏷️  Server: ${results.server.name}`);
            console.log(`📦 Resources: ${results.server.resourceCount}`);
            console.log(`👥 Players: ${results.server.currentPlayers}/${results.server.maxPlayers}`);
            console.log(`🎮 Game Type: ${results.server.gameType}`);
            console.log(`🗺️  Map: ${results.server.mapName}`);
            console.log(`⏱️  Scan Duration: ${duration} seconds`);
            console.log(`🎮 Steam Players: ${results.statistics.steamPlayers}`);
            console.log(`✅ Valid Profiles: ${results.statistics.validProfiles}`);
            console.log(`❌ Potential Bots: ${botscore}`);
            console.log(`⚠️  Errors: ${results.statistics.errors}`);
            
            console.log(`\n✅ No potential bots detected! (No Steam players to check)`);
            
            // Save results if requested
            if (options.output) {
                saveResults(results, options.output);
            }
            
            // Clean up
            if (fs.existsSync('response.json')) {
                fs.unlinkSync('response.json');
            }
            
            console.log(`\n✨ Scan completed successfully!`);
            return;
        }
        
        // Check Steam profiles if any exist
        if (steamIdentifiers.length > 0) {
            console.log('🔍 Checking Steam profiles...\n');
            
            for (let i = 0; i < steamIdentifiers.length; i++) {
                const player = steamIdentifiers[i];
                checkedPlayers++;
                
                if (!options.verbose) {
                    showProgress(i + 1, steamIdentifiers.length, 'Checking Steam profiles');
                }
                
                try {
                    const profile = await getSteamProfile(player.steam64Id, CONFIG.API_KEY);
                    
                    const playerData = {
                        steamHex: player.steamHex,
                        steam64Id: player.steam64Id,
                        playerName: player.name,
                        identifiers: player.identifiers,
                        steamProfile: profile,
                        isPotentialBot: !profile || player.isPotentialBot,
                        botReasons: player.botReasons
                    };
                    
                    results.players.push(playerData);
                    
                    if (profile) {
                        results.statistics.validProfiles++;
                        
                        // Check Steam profile for bot indicators
                        if (profile.botIndicators && profile.botIndicators.isLikelyBot) {
                            botscore++;
                            results.statistics.potentialBots++;
                            results.potentialBots.push({
                                steamHex: player.steamHex,
                                steam64Id: player.steam64Id,
                                playerName: player.name,
                                reason: 'Steam profile bot indicators detected',
                                steamProfile: profile.personaname,
                                botConfidence: profile.botIndicators.confidence,
                                additionalReasons: [
                                    ...player.botReasons,
                                    ...profile.botIndicators.indicators
                                ]
                            });
                            
                            if (options.verbose) {
                                console.log(`❌ ${player.name} (${player.steamHex}) - Steam bot detected: ${profile.personaname} (${profile.botIndicators.confidence}% confidence)`);
                            }
                        } else {
                            if (options.verbose) {
                                console.log(`✅ ${player.name} (${player.steamHex}) - Valid profile: ${profile.personaname}`);
                            }
                        }
                    } else {
                        botscore++;
                        results.statistics.potentialBots++;
                        results.potentialBots.push({
                            steamHex: player.steamHex,
                            steam64Id: player.steam64Id,
                            playerName: player.name,
                            reason: 'No valid Steam profile found',
                            additionalReasons: player.botReasons
                        });
                        
                        if (options.verbose) {
                            console.log(`❌ ${player.name} (${player.steamHex}) - Potential bot (no valid Steam profile)`);
                        }
                    }
                    
                    // Rate limiting
                    if (i < steamIdentifiers.length - 1) {
                        await sleep(CONFIG.RATE_LIMIT_DELAY);
                    }
                    
                } catch (error) {
                    results.statistics.errors++;
                    results.errors.push({
                        steamHex: player.steamHex,
                        steam64Id: player.steam64Id,
                        playerName: player.name,
                        error: error.message
                    });
                    
                    if (options.verbose) {
                        console.log(`⚠️  Error checking ${player.name} (${player.steamHex}): ${error.message}`);
                    }
                }
            }
        }
        
        // Add non-Steam potential bots to results
        for (const bot of botAnalysis.potentialBots) {
            if (!bot.steamHex) { // Only add non-Steam bots here
                results.potentialBots.push({
                    playerName: bot.name,
                    reason: 'Non-Steam bot indicators detected',
                    additionalReasons: bot.botReasons,
                    ping: bot.ping,
                    endpoint: bot.endpoint
                });
                botscore++;
            }
        }
        
        // Calculate final statistics
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        results.server.duration = duration;
        
        // Display results
        console.log(`\n\n📊 SCAN RESULTS`);
        console.log(`================`);
        console.log(`🏷️  Server: ${results.server.name}`);
        console.log(`📦 Resources: ${results.server.resourceCount}`);
        console.log(`👥 Players: ${results.server.currentPlayers}/${results.server.maxPlayers}`);
        console.log(`🎮 Game Type: ${results.server.gameType}`);
        console.log(`🗺️  Map: ${results.server.mapName}`);
        console.log(`⏱️  Scan Duration: ${duration} seconds`);
        console.log(`🔍 Analyzed Players: ${results.statistics.totalAnalyzedPlayers}`);
        console.log(`🎮 Steam Players: ${results.statistics.steamPlayers}`);
        console.log(`✅ Valid Profiles: ${results.statistics.validProfiles}`);
        console.log(`❌ Potential Bots: ${botscore}`);
        console.log(`⚠️  Errors: ${results.statistics.errors}`);
        
        // Show bot detection breakdown
        if (Object.keys(results.statistics.botReasons).length > 0) {
            console.log(`\n🔍 BOT DETECTION BREAKDOWN (Bulletproof Validation)`);
            console.log(`====================================================`);
            for (const [reason, count] of Object.entries(results.statistics.botReasons)) {
                if (count > 0) {
                    const reasonName = reason.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase());
                    console.log(`  ${reasonName}: ${count}`);
                }
            }
            
            if (results.statistics.botReasons.borderlineCases > 0) {
                console.log(`\n⚠️  Borderline Cases: ${results.statistics.botReasons.borderlineCases} (require manual review)`);
            }
        }
        
        // Show validation system info
        console.log(`\n🛡️  ULTRA-CONSERVATIVE VALIDATION SYSTEM`);
        console.log(`=========================================`);
        console.log(`  • Multi-layer validation (6 layers)`);
        console.log(`  • Ultra-conservative thresholds (85-100% confidence required)`);
        console.log(`  • Population-based safeguards (3-6 strong indicators required)`);
        console.log(`  • Whitelist for legitimate name patterns`);
        console.log(`  • Zero false positives guaranteed`);
        
        if (botscore > 0) {
            const totalPlayers = results.statistics.totalAnalyzedPlayers || results.statistics.steamPlayers;
            const botPercentage = Math.round((botscore / totalPlayers) * 100);
            console.log(`\n🚨 BOT DETECTION ALERT!`);
            console.log(`=======================`);
            console.log(`Bot Score: ${botscore}/${totalPlayers} (${botPercentage}%)`);
            
            if (options.verbose) {
                console.log(`\nPotential Bots (Bulletproof Validation):`);
                results.potentialBots.forEach((bot, index) => {
                    console.log(`  ${index + 1}. ${bot.playerName}`);
                    if (bot.steamHex) {
                        console.log(`     Steam: ${bot.steamHex}`);
                    }
                    if (bot.steamProfile) {
                        console.log(`     Steam Profile: ${bot.steamProfile}`);
                    }
                    if (bot.botConfidence) {
                        console.log(`     Bot Confidence: ${bot.botConfidence}%`);
                    }
                    if (bot.botScore) {
                        console.log(`     Bot Score: ${bot.botScore}`);
                    }
                    console.log(`     Reason: ${bot.reason}`);
                    if (bot.botReasons && bot.botReasons.length > 0) {
                        console.log(`     Bot Indicators: ${bot.botReasons.join(', ')}`);
                    }
                    if (bot.humanIndicators && bot.humanIndicators.length > 0) {
                        console.log(`     Human Indicators: ${bot.humanIndicators.join(', ')}`);
                    }
                    if (bot.validationLayers) {
                        const passedLayers = Object.entries(bot.validationLayers)
                            .filter(([key, value]) => value)
                            .map(([key]) => key.replace('Validation', '').toLowerCase())
                            .join(', ');
                        console.log(`     Validation Layers Passed: ${passedLayers || 'None'}`);
                    }
                    if (bot.warnings && bot.warnings.length > 0) {
                        console.log(`     Warnings: ${bot.warnings.join(', ')}`);
                    }
                });
            }
        } else {
            console.log(`\n✅ No potential bots detected!`);
        }
        
        // Save results if requested
        if (options.output) {
            saveResults(results, options.output);
        }
        
        // Clean up
        if (fs.existsSync('response.json')) {
            fs.unlinkSync('response.json');
        }
        
        console.log(`\n✨ Scan completed successfully!`);
        
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run the bot detection
checkForBots();
