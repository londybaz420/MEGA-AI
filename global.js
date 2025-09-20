process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'
import './config.js'

import dotenv from 'dotenv'
import fs, { existsSync, readFileSync, readdirSync, unlinkSync, watch } from 'fs'
import { createRequire } from 'module'
import path, { join } from 'path'
import { platform } from 'process'
import { fileURLToPath, pathToFileURL } from 'url'
import * as ws from 'ws'
import { useMongoDBAuthState } from './auth/mongo-auth.js'
import * as mongoStore from './auth/mongo-store.js'
import NodeCache from 'node-cache'
import { MongoDB } from './lib/mongoDB.js'

// First define the global utility functions
global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix
    ? /file:\/\/\//.test(pathURL)
      ? fileURLToPath(pathURL)
      : pathURL
    : pathToFileURL(pathURL).toString()
}
global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true))
}
global.__require = function require(dir = import.meta.url) {
  return createRequire(dir)
}

// Now that __dirname is defined, we can use it
const __dirname = global.__dirname(import.meta.url)
const SESSIONS_DIR = __dirname + '/sessions'
const CREDS_FILE = SESSIONS_DIR + '/creds.json'

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

global.gurubot = 'https://www.guruapi.tech/api'
import chalk from 'chalk'
import { spawn } from 'child_process'
import lodash from 'lodash'
import { default as Pino, default as pino } from 'pino'
import syntaxerror from 'syntax-error'
import { format } from 'util'
import yargs from 'yargs'
import PHONENUMBER_MCC from './lib/mcc.js'
import { makeWASocket, protoType, serialize } from './lib/simple.js'

const {
  DisconnectReason,
  MessageRetryMap,
  fetchLatestWaWebVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  proto,
  delay,
  jidNormalizedUser
} = await (
  await import('baileys-pro')
).default

dotenv.config()

// ✅ Session validation function - Less restrictive
function isValidSession(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') {
    console.log(chalk.yellow('⚠️ Session data is not a valid object'));
    return false;
  }
  
  // Basic validation - check if it has the basic structure of a Baileys session
  if (!sessionData.creds || typeof sessionData.creds !== 'object') {
    console.log(chalk.yellow('⚠️ Session missing creds object'));
    return false;
  }
  
  // Check if we have minimal required data
  if (!sessionData.creds.me || !sessionData.creds.me.id) {
    console.log(chalk.yellow('⚠️ Session missing user identity'));
    return false;
  }
  
  console.log(chalk.green('✅ Session validation passed'));
  return true;
}

// ✅ Improved pairing request function
async function requestNewPairing(conn) {
  let phoneNumber = process.env.BOT_NUMBER?.replace(/[^0-9]/g, "")
  if (!phoneNumber || phoneNumber.length < 8) {
    console.log(chalk.red("❌ Invalid phone number format. Example: 92xxx"))
    process.exit(0)
  }

  conn.logger.info("\nWaiting For Login\n")

  try {
    let code = await conn.requestPairingCode(phoneNumber)
    code = code?.match(/.{1,4}/g)?.join("-") || code

    global.pairingCode = code

    console.log(
      chalk.bold.greenBright("Your Pairing Code:") +
        " " +
        chalk.bgGreenBright(chalk.black(code))
    )

    if (process.send) {
      process.send({
        type: "pairing-code",
        code: code,
        error: false,
      })
    }

    // Wait for connection with timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Pairing timeout after 2 minutes"));
      }, 120000);
      
      // Check when connection is established
      const checkConnection = () => {
        if (conn.user && conn.user.id) {
          clearTimeout(timeout);
          resolve();
        }
      };
      
      // Check every 5 seconds
      const interval = setInterval(checkConnection, 5000);
      
      // Also resolve if connection is already established
      checkConnection();
    });
    
    console.log(chalk.green("✅ Pairing successful, connection established"));
    return true;
  } catch (error) {
    console.log(chalk.bgBlack(chalk.redBright("Failed to generate pairing code:")), error)
    if (process.send) {
      process.send({
        type: "pairing-code",
        code: "ERROR: Failed to generate pairing code",
        error: true,
      })
    }
    return false;
  }
}

// Session backup system
function backupSession(sessionData) {
  try {
    const backupDir = join(SESSIONS_DIR, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFile = join(backupDir, `creds-backup-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(sessionData, null, 2));
    console.log(chalk.blue(`📦 Session backed up to: ${backupFile}`));
  } catch (error) {
    console.error('Backup failed:', error);
  }
}

// ✅ Improved session loading function
async function loadSessionOrPairing(conn) {
  // ✅ Case 1: creds.json already exists
  if (fs.existsSync(CREDS_FILE)) {
    try {
      const sessionData = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'));
      
      // Validate session data structure
      if (isValidSession(sessionData)) {
        console.log(chalk.greenBright("✅ Valid session loaded from local creds.json"))
        
        // Update session timestamp to prevent expiration
        if (sessionData.creds) {
          sessionData.creds.accountSettings = {
            ...(sessionData.creds.accountSettings || {}),
            accountSyncTimestamp: Date.now()
          };
          fs.writeFileSync(CREDS_FILE, JSON.stringify(sessionData, null, 2));
        }
        
        return true;
      } else {
        console.log(chalk.yellow("⚠️ Session file exists but is invalid, will try other methods..."));
      }
    } catch (err) {
      console.error("❌ Error reading/parsing creds.json:", err);
    }
  }

  // ✅ Case 2: SESSION_ID provided
  if (process.env.SESSION_ID) {
    // Case 2a: EDITH-MD~ (Base64 decode)
    if (process.env.SESSION_ID.startsWith("EDITH-MD~")) {
      try {
        const sessdata = process.env.SESSION_ID.replace("EDITH-MD~", "")
        const decodedData = Buffer.from(sessdata, "base64").toString("utf-8")
        const sessionData = JSON.parse(decodedData);
        
        // Validate the session data before saving
        if (isValidSession(sessionData)) {
          // Update timestamp before saving
          sessionData.creds.accountSettings = {
            ...(sessionData.creds.accountSettings || {}),
            accountSyncTimestamp: Date.now()
          };
          
          const updatedData = JSON.stringify(sessionData, null, 2);
          fs.writeFileSync(CREDS_FILE, updatedData);
          console.log(chalk.greenBright("✅ Valid session loaded from EDITH-MD~ string"))
          return true;
        } else {
          console.log(chalk.yellow("⚠️ Session data from EDITH-MD~ is invalid"));
        }
      } catch (err) {
        console.error("❌ Error decoding session data:", err);
      }
    }

    // Case 2b: Direct JSON (if someone pastes full JSON)
    else if (process.env.SESSION_ID.startsWith("{")) {
      try {
        const sessionData = JSON.parse(process.env.SESSION_ID);
        
        if (isValidSession(sessionData)) {
          // Update timestamp before saving
          sessionData.creds.accountSettings = {
            ...(sessionData.creds.accountSettings || {}),
            accountSyncTimestamp: Date.now()
          };
          
          const updatedData = JSON.stringify(sessionData, null, 2);
          fs.writeFileSync(CREDS_FILE, updatedData);
          console.log(chalk.greenBright("✅ Valid session loaded from direct JSON"))
          return true;
        }
      } catch (err) {
        console.error("❌ Error parsing direct JSON session:", err);
      }
    }

    // Invalid SESSION_ID format
    else {
      console.log(chalk.yellow("❌ Invalid SESSION_ID format"));
    }
  } else {
    console.log(chalk.yellow("⚠️ No SESSION_ID provided"));
  }

  // ❌ Case 3: No valid session → request pairing code
  console.log(chalk.yellow("🔄 Falling back to pairing code..."));
  return await requestNewPairing(conn);
}

const groupMetadataCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'guru_bot'

const globalDB = new MongoDB(MONGODB_URI)

global.db = globalDB

global.loadDatabase = async function loadDatabase() {
  try {
    if (global.db && typeof global.db.read === 'function') {
      await global.db.read()
      global.db.data = {
        users: {},
        chats: {},
        settings: {},
        stats: {},
        ...(global.db.data || {})
      }
      console.log(chalk.green('✅ Database loaded successfully'));
    } else {
      console.log(chalk.yellow('⚠️ Database not available, using in-memory storage'))
      global.db = {
        data: {
          users: {},
          chats: {},
          settings: {},
          stats: {}
        },
        read: () => Promise.resolve(),
        write: () => Promise.resolve()
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Error loading database:'), error);
    global.db = {
      data: {
        users: {},
        chats: {},
        settings: {},
        stats: {}
      },
      read: () => Promise.resolve(),
      write: () => Promise.resolve()
    }
  }
}

// Set up interval for saving data only if db is available
if (global.db && typeof global.db.write === 'function') {
  setInterval(async () => {
    try {
      if (global.db.data) await global.db.write(global.db.data)
    } catch (error) {
      console.error(chalk.red('❌ Error saving database:'), error);
    }
  }, 60 * 1000)
}

await global.loadDatabase()

const phoneNumberFromEnv = process.env.BOT_NUMBER

const MAIN_LOGGER = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` })

const logger = MAIN_LOGGER.child({})
logger.level = 'silent'

const msgRetryCounterCache = new NodeCache()

const { CONNECTING } = ws
const { chain } = lodash
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000

protoType()
serialize()

global.API = (name, path = '/', query = {}) =>
  name + path + (query ? '?' + new URLSearchParams(Object.entries(query)) : '')
global.timestamp = {
  start: new Date(),
}

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp(
  '^[' +
    (process.env.PREFIX || '*/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-.@').replace(
      /[|\\{}()[\]^$+*?.\-\^]/g,
      '\\$&'
    ) +
    ']'
)
global.opts['db'] = process.env.MONGODB_URI

// Initialize MongoDB auth state with fallback
let authState = { creds: {}, keys: {} };
try {
  const mongoAuth = await useMongoDBAuthState(MONGODB_URI, DB_NAME);
  authState = mongoAuth;
  console.log(chalk.green('✅ MongoDB auth initialized successfully'));
} catch (error) {
  console.log(chalk.yellow('⚠️ MongoDB auth not available, using in-memory session storage'));
  // Create a simple in-memory auth state
  authState = {
    state: {
      creds: {},
      keys: {}
    },
    saveCreds: () => Promise.resolve(),
    closeConnection: () => Promise.resolve()
  };
}

const { state, saveCreds, closeConnection } = authState;

const connectionOptions = {
  logger: Pino({
    level: 'silent',
  }),
  printQRInTerminal: false,
  version: [2, 3000, 1023223821],
  browser: Browsers.ubuntu('Chrome'),
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(
      state.keys,
      Pino().child({
        level: 'silent',
        stream: 'store',
      })
    ),
  },
  markOnlineOnConnect: true,
  generateHighQualityLinkPreview: true,
  cachedGroupMetadata: async (jid) => {
    const cached = groupMetadataCache.get(jid)
    if (cached) return cached
    try {
      const mongoMeta = await mongoStore.groupMetadata(jid, DB_NAME)
      if (mongoMeta) groupMetadataCache.set(jid, mongoMeta)
      return mongoMeta || null
    } catch (e) {
      return null
    }
  },
  getMessage: async key => {
    let jid = jidNormalizedUser(key.remoteJid)
    let msg = await mongoStore.loadMessage(key.id, jid, DB_NAME)
    return msg?.message || ''
  },
  patchMessageBeforeSending: message => {
    const requiresPatch = !!(
      message.buttonsMessage ||
      message.templateMessage ||
      message.listMessage
    )
    if (requiresPatch) {
      message = {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadataVersion: 2,
              deviceListMetadata: {},
            },
            ...message,
          },
        },
      }
    }

    return message
  },
  msgRetryCounterCache,
  defaultQueryTimeoutMs: 0,
  syncFullHistory: false,
}

global.conn = makeWASocket(connectionOptions)
conn.isInit = false

// Session refresh logic
async function refreshSession() {
  try {
    if (conn.authState.creds && conn.authState.creds.registered) {
      // Update session timestamp to prevent expiration
      conn.authState.creds.accountSettings = {
        ...(conn.authState.creds.accountSettings || {}),
        accountSyncTimestamp: Date.now()
      };
      
      // Save the updated session
      await saveCreds();
      
      // Also update the local file
      if (fs.existsSync(CREDS_FILE)) {
        const sessionData = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'));
        sessionData.creds.accountSettings = {
          ...(sessionData.creds.accountSettings || {}),
          accountSyncTimestamp: Date.now()
        };
        fs.writeFileSync(CREDS_FILE, JSON.stringify(sessionData, null, 2));
      }
      
      console.log(chalk.blue('🔄 Session refreshed'));
    }
  } catch (error) {
    console.error('Session refresh failed:', error);
  }
}

// ✅ Modified connection update to handle session properly
async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin } = update
  global.stopped = connection

  if (isNewLogin) conn.isInit = true

  const code =
    lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode

  // Handle session termination errors
  if (code === DisconnectReason.loggedOut || code === 515) {
    console.log(chalk.red("❌ Session terminated, need to generate new session"));
    
    // Delete old session file
    if (fs.existsSync(CREDS_FILE)) {
      fs.unlinkSync(CREDS_FILE);
      console.log(chalk.yellow("🗑️ Removed old session file"));
    }
    
    // Request new pairing
    await requestNewPairing(conn);
    return;
  }

  if (code && code !== DisconnectReason.loggedOut && conn?.ws.socket == null) {
    console.log(chalk.yellow(`🔄 Reconnecting after disconnect, code: ${code}`));
    try {
      await global.reloadHandler(true).catch(console.error);
    } catch (error) {
      console.error('Error reloading handler:', error);
    }
  }

  if (code && (code === DisconnectReason.restartRequired || code === 428)) {
    conn.logger.info(chalk.yellow('\n🌀 Restart Required... Preparing for restart'))
    
    try {
      if (global.db.data && typeof global.db.write === 'function') {
        conn.logger.info(chalk.blue('Saving database before restart...'))
        await global.db.write(global.db.data)
        conn.logger.info(chalk.green('Database saved successfully'))
      }
    } catch (error) {
      console.error('Error saving database before restart:', error)
    }
    
    try {
      await global.loadDatabase()
      conn.logger.info(chalk.green('Database connection verified, proceeding with restart'))
    } catch (dbError) {
      conn.logger.error(chalk.red('Database connection error before restart, using in-memory storage'))
    }
    
    if (process.send) {
      process.send('reset')
    } else {
      conn.logger.info(chalk.yellow('Reloading handler...'))
      await global.reloadHandler(true)
    }
  }

  if (global.db.data == null) await global.loadDatabase()

  if (connection === 'open') {
    if (process.send) {
      process.send({ 
        type: 'connection-status', 
        connected: true 
      })
    }
    
    try {
      await global.loadDatabase()
      conn.logger.info(chalk.green('Database connection verified on open'))
    } catch (error) {
      conn.logger.error(chalk.red('Database connection error on open, using in-memory storage'))
    }
    
    const { jid, name } = conn.user
    
    try {
      const dashboardStats = await generateDatabaseStats()
      conn.logger.info(chalk.cyan('\n' + dashboardStats + '\n'))
      
      const welcomeMessage = `*🤖 MEGA-AI CONNECTED*\n\nHi ${name}, your bot is now online!*\n\n${dashboardStats}\n\nNeed help? Join support group:\nhttps://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07`

      await conn.sendMessage(jid, { text: welcomeMessage }, { quoted: null })
    } catch (error) {
      console.error('Error generating dashboard:', error)
      const msg = `*ULTRA-MD Connected* \n\n *SUPPORT BY SUBSCRIBE*
*youtube.com/@GlobalTechInfo*`
        
      await conn.sendMessage(jid, { text: msg, mentions: [jid] }, { quoted: null })
    }

    conn.logger.info(chalk.yellow('\n👍 R E A D Y'))
    
    // Schedule session refresh after successful connection
    setTimeout(refreshSession, 10000);
  }

  if (connection === 'close') {
    if (process.send) {
      process.send({ 
        type: 'connection-status', 
        connected: false 
      })
    }
    
    try {
      await global.loadDatabase()
      conn.logger.info(chalk.blue('Database connection maintained despite WhatsApp disconnection'))
    } catch (error) {
      conn.logger.error(chalk.red('Database connection lost on WhatsApp disconnect, using in-memory storage'))
    }
    
    conn.logger.error(chalk.yellow(`\nConnection closed... Get a new session`))
  }
}

// Run this after conn is created
await loadSessionOrPairing(conn);

// SAVE CREDS.JSON AND RELOAD THEM AFTER RESTART
if (fs.existsSync(CREDS_FILE)) {
  try {
    const savedAuth = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'))
    if (savedAuth?.creds) {
      // Only update if we don't already have a valid session
      if (!conn.authState.creds || !conn.authState.creds.registered) {
        conn.authState.creds = savedAuth.creds
        console.log(chalk.greenBright("✅ Session restored from creds.json"))
        
        // Schedule periodic session refresh (every 7 days)
        setInterval(refreshSession, 7 * 24 * 60 * 60 * 1000);
      }
    }
  } catch (err) {
    console.error("❌ Failed to load creds.json:", err)
  }
}

if (!global.opts['test']) {
  if (global.db && typeof global.db.write === 'function') {
    setInterval(async () => {
      try {
        if (global.db.data) await global.db.write(global.db.data)
      } catch (error) {
        console.error(chalk.red('❌ Error saving database:'), error);
      }
    }, 30 * 1000)
  }
}

if (global.opts['server']) {
  try {
    const serverModule = await import('./server.js')
    serverModule.default(global.conn, PORT)
  } catch (error) {
    console.log(chalk.yellow('⚠️ Server module not available'))
  }
}

// Event handlers with error catching
conn.ev.on('messaging-history.set', ({ messages }) => {
  if (messages && messages.length > 0) {
    mongoStore.saveMessages({ messages, type: 'append' }, DB_NAME).catch(console.error)
  }
})

conn.ev.on('contacts.update', async (contacts) => {
  for (const contact of contacts) {
    try {
      await mongoStore.saveContact(contact, DB_NAME)
    } catch (error) {
      console.error('Error saving contact:', error)
    }
  }
})

conn.ev.on('contacts.upsert', async (contacts) => {
  for (const contact of contacts) {
    try {
      await mongoStore.saveContact(contact, DB_NAME)
    } catch (error) {
      console.error('Error upserting contact:', error)
    }
  }
})

conn.ev.on('messages.upsert', ({ messages }) => {
  mongoStore.saveMessages({ messages, type: 'upsert' }, DB_NAME).catch(console.error)
})

conn.ev.on('messages.update', async (messageUpdates) => {
  mongoStore.saveMessages({ messages: messageUpdates, type: 'update' }, DB_NAME).catch(console.error)
})

conn.ev.on('message-receipt.update', async (messageReceipts) => {
  mongoStore.saveReceipts(messageReceipts, DB_NAME).catch(console.error)
})

conn.ev.on('groups.update', async ([event]) => {
  if (event.id) {
    try {
      const metadata = await conn.groupMetadata(event.id)
      if (metadata) {
        groupMetadataCache.set(event.id, metadata)
        await mongoStore.saveGroupMetadata(event.id, metadata, DB_NAME).catch(() => {})
      }
    } catch (error) {
      console.error('Error updating group metadata:', error)
    }
  }
})

conn.ev.on('group-participants.update', async (event) => {
  if (event.id) {
    try {
      const metadata = await conn.groupMetadata(event.id)
      if (metadata) {
        groupMetadataCache.set(event.id, metadata)
        await mongoStore.saveGroupMetadata(event.id, metadata, DB_NAME).catch(() => {})
      }
    } catch (error) {
      console.error('Error updating group participants:', error)
    }
  }
})

process.on('exit', async () => { 
  try {
    await closeConnection() 
  } catch (error) {
    console.error('Error closing connection:', error)
  }
})

process.on('SIGINT', async () => { 
  try {
    await closeConnection() 
    process.exit(0)
  } catch (error) {
    process.exit(0)
  }
})

process.on('SIGTERM', async () => { 
  try {
    await closeConnection() 
    process.exit(0)
  } catch (error) {
    process.exit(0)
  }
})

// Enhanced error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Attempt to reinitialize connection on critical errors
  if (reason.message && reason.message.includes('session')) {
    console.log(chalk.yellow('🔄 Session error detected, attempting reconnect...'));
    setTimeout(() => {
      global.reloadHandler(true).catch(console.error);
    }, 5000);
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit for session-related errors
  if (!error.message.includes('session') && !error.message.includes('auth')) {
    process.exit(1);
  }
});

let isInit = true
let handler = {}
try {
  const Handler = await import('./handler.js')
  handler = Handler.default || Handler
} catch (error) {
  console.error('Error loading handler:', error)
  // Create a minimal handler to prevent crashes
  handler = {
    handler: () => {},
    pollUpdate: () => {},
    participantsUpdate: () => {},
    groupsUpdate: () => {},
    deleteUpdate: () => {},
    presenceUpdate: () => {}
  }
}

global.reloadHandler = async function (restatConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error)
    if (Handler && Object.keys(Handler || {}).length) {
      handler = Handler.default || Handler
    }
  } catch (error) {
    console.error('Error reloading handler:', error)
  }
  
  if (restatConn) {
    const oldChats = global.conn.chats
    try {
      global.conn.ws.close()
    } catch {}
    conn.ev.removeAllListeners()
    global.conn = makeWASocket(connectionOptions, {
      chats: oldChats,
    })
    isInit = true
  }
  
  if (!isInit) {
    conn.ev.off('messages.upsert', conn.handler)
    conn.ev.off('messages.update', conn.pollUpdate)
    conn.ev.off('group-participants.update', conn.participantsUpdate)
    conn.ev.off('groups.update', conn.groupsUpdate)
    conn.ev.off('message.delete', conn.onDelete)
    conn.ev.off('presence.update', conn.presenceUpdate)
    conn.ev.off('connection.update', conn.connectionUpdate)
    conn.ev.off('creds.update', conn.credsUpdate)
  }

  conn.welcome = ` Hello @user!\n\n🎉 *WELCOME* to the group @group!\n\n📜 Please read the *DESCRIPTION* @desc.`
  conn.bye = `👋GOODBYE @user \n\nSee you later!`
  conn.spromote = `*@user* has been promoted to an admin!`
  conn.sdemote = `*@user* is no longer an admin.`
  conn.sDesc = `The group description has been updated to:\n@desc`
  conn.sSubject = `The group title has been changed to:\n@group`
  conn.sIcon = `The group icon has been updated!`
  conn.sRevoke = ` The group link has been changed to:\n@revoke`
  conn.sAnnounceOn = `The group is now *CLOSED*!\nOnly admins can send messages.`
  conn.sAnnounceOff = `The group is now *OPEN*!\nAll participants can send messages.`
  conn.sRestrictOn = `Edit Group Info has been restricted to admins only!`
  conn.sRestrictOff = `Edit Group Info is now available to all participants!`

  conn.handler = handler.handler.bind(global.conn)
  conn.pollUpdate = handler.pollUpdate.bind(global.conn)
  conn.participantsUpdate = handler.participantsUpdate.bind(global.conn)
  conn.groupsUpdate = handler.groupsUpdate.bind(global.conn)
  conn.onDelete = handler.deleteUpdate.bind(global.conn)
  conn.presenceUpdate = handler.presenceUpdate.bind(global.conn)
  conn.connectionUpdate = connectionUpdate.bind(global.conn)
  conn.credsUpdate = saveCreds.bind(global.conn, true)

  conn.ev.on('messages.upsert', conn.handler)
  conn.ev.on('messages.update', conn.pollUpdate)
  conn.ev.on('group-participants.update', conn.participantsUpdate)
  conn.ev.on('groups.update', conn.groupsUpdate)
  conn.ev.on('message.delete', conn.onDelete)
  conn.ev.on('presence.update', conn.presenceUpdate)
  conn.ev.on('connection.update', conn.connectionUpdate)
  conn.ev.on('creds.update', conn.credsUpdate)
  
  isInit = false
  return true
}

if (process.on) {
  process.on('message', async (data) => {
    if (typeof data === 'object' && data.type === 'request-stats') {
      try {
        const stats = await generateStatsData()
        if (process.send) {
          process.send({ 
            type: 'stats', 
            stats: stats 
          })
        }
      } catch (error) {
        console.error('Error generating stats for parent process:', error)
      }
    }
  })
}

async function generateStatsData() {
  try {
    if (!global.db.data) await global.loadDatabase()
    
    return {
      users: Object.keys(global.db.data.users || {}).length,
      groups: Object.keys(global.db.data.chats || {}).filter(id => id.endsWith('@g.us')).length,
      privateChats: Object.keys(global.db.data.chats || {}).filter(id => !id.endsWith('@g.us')).length,
      totalChats: Object.keys(global.db.data.chats || {}).length,
      settings: Object.keys(global.db.data.settings || {}).length,
      plugins: Object.keys(global.plugins || {}).length,
      uptime: formatUptime(process.uptime()),
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      bannedUsers: Object.values(global.db.data.users || {}).filter(user => user.banned).length,
      activeGroups: Object.values(global.db.data.chats || {}).filter(chat => !chat.isBanned && chat.id?.endsWith('@g.us')).length,
      registeredUsers: Object.values(global.db.data.users || {}).filter(user => user.registered).length,
      topPlugins: global.db.data.stats ? 
        Object.entries(global.db.data.stats)
          .map(([name, stat]) => ({ name, total: stat.total || 0 }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5) : []
    }
  } catch (error) {
    console.error("Error generating stats data:", error)
    return { error: "Failed to generate statistics" }
  }
}

const pluginFolder = global.__dirname(join(__dirname, './plugins/index'))
const pluginFilter = filename => /\.js$/.test(filename)
global.plugins = {}

async function filesInit() {
  if (!fs.existsSync(pluginFolder)) {
    console.log(chalk.yellow(`⚠️ Plugins folder not found: ${pluginFolder}`))
    return
  }
  
  for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
    try {
      const file = global.__filename(join(pluginFolder, filename))
      const module = await import(file)
      global.plugins[filename] = module.default || module
    } catch (e) {
      console.error(`Error loading plugin ${filename}:`, e)
      delete global.plugins[filename]
    }
  }
}

filesInit()
  .then(_ => console.log(chalk.green(`✅ Loaded ${Object.keys(global.plugins).length} plugins`)))
  .catch(console.error)

global.reload = async (_ev, filename) => {
  if (pluginFilter(filename)) {
    const dir = global.__filename(join(pluginFolder, filename), true)
    if (filename in global.plugins) {
      if (existsSync(dir)) console.log(chalk.green(`\nUpdated plugin - '${filename}'`))
      else {
        console.log(chalk.yellow(`\nDeleted plugin - '${filename}'`))
        return delete global.plugins[filename]
      }
    } else console.log(chalk.green(`\nNew plugin - '${filename}'`))
    
    const err = syntaxerror(readFileSync(dir), filename, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    })
    
    if (err) console.error(chalk.red(`\nSyntax error while loading '${filename}'\n${format(err)}`))
    else {
      try {
        const module = await import(`${global.__filename(dir)}?update=${Date.now()}`)
        global.plugins[filename] = module.default || module
      } catch (e) {
        console.error(chalk.red(`\nError require plugin '${filename}\n${format(e)}'`))
      } finally {
        global.plugins = Object.fromEntries(
          Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
        )
      }
    }
  }
}

Object.freeze(global.reload)

// Only watch plugin folder if it exists
if (fs.existsSync(pluginFolder)) {
  watch(pluginFolder, global.reload)
} else {
  console.log(chalk.yellow(`⚠️ Cannot watch plugins folder: ${pluginFolder} does not exist`))
}

await global.reloadHandler()

async function _quickTest() {
  const test = await Promise.all(
    [
      spawn('ffmpeg'),
      spawn('ffprobe'),
      spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-filter_complex',
        'color',
        '-frames:v',
        '1',
        '-f',
        'webp',
        '-',
      ]),
      spawn('convert'),
      spawn('magick'),
      spawn('gm'),
      spawn('find', ['--version']),
    ].map(p => {
      return Promise.race([
        new Promise(resolve => {
          p.on('close', code => {
            resolve(code !== 127)
          })
        }),
        new Promise(resolve => {
          p.on('error', _ => resolve(false))
        }),
      ])
    })
  )
  const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test
  const s = (global.support = {
    ffmpeg,
    ffprobe,
    ffmpegWebp,
    convert,
    magick,
    gm,
    find,
  })
  Object.freeze(global.support)
}

_quickTest().catch(console.error)

async function generateDatabaseStats() {
  try {
    if (!global.db.data) await global.loadDatabase()
    
    const stats = {
      users: Object.keys(global.db.data.users || {}).length,
      groups: Object.keys(global.db.data.chats || {}).filter(id => id.endsWith('@g.us')).length,
      privateChats: Object.keys(global.db.data.chats || {}).filter(id => !id.endsWith('@g.us')).length,
      totalChats: Object.keys(global.db.data.chats || {}).length,
      settings: Object.keys(global.db.data.settings || {}).length,
      plugins: Object.keys(global.plugins || {}).length,
      uptime: formatUptime(process.uptime()),
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      bannedUsers: Object.values(global.db.data.users || {}).filter(user => user.banned).length,
      activeGroups: Object.values(global.db.data.chats || {}).filter(chat => !chat.isBanned && chat.id?.endsWith('@g.us')).length,
      registeredUsers: Object.values(global.db.data.users || {}).filter(user => user.registered).length,
    }
    
    let activeChats = []
    if (global.db.data.stats) {
      const pluginStats = global.db.data.stats
      // Get plugin with most usage
      const topPlugins = Object.entries(pluginStats)
        .map(([name, stat]) => ({ name, total: stat.total || 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
      
      stats.topPlugins = topPlugins
    }
    
    return `
┌─────────────────────────────┐
│   🤖 MEGA-AI DASHBOARD 🤖   │
├─────────────────────────────┤
│                             │
│ 👥 Users: ${padRight(stats.users, 19)} │
│ 🛡️ Banned Users: ${padRight(stats.bannedUsers, 13)} │
│ 📝 Registered: ${padRight(stats.registeredUsers, 14)} │
│                             │
│ 👥 Groups: ${padRight(stats.groups, 18)} │
│ 💬 Private Chats: ${padRight(stats.privateChats, 11)} │
│ 📊 Total Chats: ${padRight(stats.totalChats, 13)} │
│ 🟢 Active Groups: ${padRight(stats.activeGroups, 11)} │
│                             │
│ ⚙️ Settings: ${padRight(stats.settings, 16)} │
│ 🔌 Plugins: ${padRight(stats.plugins, 17)} │
│                             │
│ ⏱️ Uptime: ${padRight(stats.uptime, 18)} │
│ 💾 Memory: ${padRight(stats.memoryUsage, 18)} │
│                             │
${stats.topPlugins && stats.topPlugins.length > 0 ? `│ 🔝 Top Plugins:               │\n${stats.topPlugins.map(p => `│   • ${padRight(p.name.replace('.js', ''), 20)} ${p.total} │`).join('\n')}` : '│                             │'}
└─────────────────────────────┘
    `.trim()
  } catch (error) {
    console.error("Error generating dashboard:", error)
    return "Error generating dashboard statistics"
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24))
  const hours = Math.floor((seconds % (3600 * 24)) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  let result = ''
  if (days > 0) result += `${days}d `
  if (hours > 0) result += `${hours}h `
  result += `${minutes}m`
  
  return result
}

function padRight(text, length) {
  return String(text).padEnd(length)
}

console.log(chalk.green('✅ Bot initialization completed successfully!'))
