process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'
import './config.js'

import dotenv from 'dotenv'
import fs,{ existsSync, readFileSync, readdirSync, unlinkSync, watch } from 'fs'
import { createRequire } from 'module'
import path, { join } from 'path'
import { platform } from 'process'
import { fileURLToPath, pathToFileURL } from 'url'
import * as ws from 'ws'
import { useMongoDBAuthState } from './auth/mongo-auth.js'
import * as mongoStore from './auth/mongo-store.js'
import NodeCache from 'node-cache'
import { MongoDB } from './lib/mongoDB.js'
import { File } from 'megajs'

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
global.gurubot = 'https://www.guruapi.tech/api'
import chalk from 'chalk'
import { spawn } from 'child_process'
import lodash from 'lodash'
import { default as Pino, default as pino } from 'pino'
import syntaxerror from 'syntax-error'
import { format } from 'util'
import yargs from 'yargs'
import PHONENUMBER_MCC from './lib/mcc.js';
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

//SESISON MANAGEMENT
const SESSIONS_DIR = __dirname + '/sessions'
const CREDS_FILE = SESSIONS_DIR + '/creds.json'

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

async function loadSessionOrPairing(conn) {
  // ✅ Case 1: creds.json already exists
  if (fs.existsSync(CREDS_FILE)) {
    console.log(chalk.greenBright("✅ Session loaded from local creds.json"))
    return true
  }

  // ✅ Case 2: SESSION_ID provided
  if (process.env.SESSION_ID) {
    // Case 2a: EDITH-MD~ (Base64 decode)
    if (process.env.SESSION_ID.startsWith("EDITH-MD~")) {
      try {
        const sessdata = process.env.SESSION_ID.replace("EDITH-MD~", "")
        const decodedData = Buffer.from(sessdata, "base64").toString("utf-8")
        fs.writeFileSync(CREDS_FILE, decodedData)
        console.log(chalk.greenBright("✅ Session loaded from EDITH-MD~ string"))
        return true
      } catch (err) {
        console.error("❌ Error decoding session data:", err)
      }
    }

    // Case 2b: BANDAHAELI~ (Download from MEGA)
    else if (process.env.SESSION_ID.startsWith("BANDAHAELI~")) {
      try {
        console.log("[⏳] Downloading creds data from MEGA...")
        const megaFileId = process.env.SESSION_ID.replace("BANDAHAELI~", "")
        const filer = File.fromURL(`https://mega.nz/file/${megaFileId}`)

        const data = await new Promise((resolve, reject) => {
          filer.download((err, data) => {
            if (err) reject(err)
            else resolve(data)
          })
        })

        fs.writeFileSync(CREDS_FILE, data)
        console.log("[✅] MEGA session downloaded successfully")
        return true
      } catch (error) {
        console.error("[❌] Error loading MEGA session:", error.message)
      }
    }

    // Invalid SESSION_ID prefix
    else {
      console.log("❌ Invalid SESSION_ID format, falling back to pairing code...")
    }
  } else {
    console.log(chalk.yellow("⚠️ No SESSION_ID provided, falling back to pairing code..."))
  }

  // ❌ Case 3: No session → request pairing code
  if (!conn.authState.creds.registered) {
    let phoneNumber = process.env.BOT_NUMBER?.replace(/[^0-9]/g, "")
    if (!phoneNumber || phoneNumber.length < 8) {
      console.log(chalk.red("❌ Invalid phone number format. Example: 92xxx"))
      process.exit(0)
    }

    conn.logger.info("\nWaiting For Login\n")

    setTimeout(async () => {
      try {
        let code = await conn.requestPairingCode(phoneNumber, "MEGAAI44")
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

        await new Promise(resolve => setTimeout(resolve, 60000))
        conn.logger.info("1 minute passed, continuing with connection...")
      } catch (error) {
        console.log(chalk.bgBlack(chalk.redBright("Failed to generate pairing code:")), error)
        if (process.send) {
          process.send({
            type: "pairing-code",
            code: "ERROR: Failed to generate pairing code",
            error: true,
          })
        }
      }
    }, 9000)
  }
const groupMetadataCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'guru_bot'

const globalDB = new MongoDB(MONGODB_URI)

global.db = globalDB

global.loadDatabase = async function loadDatabase() {
  await global.db.read()
  global.db.data = {
    users: {},
    chats: {},
    settings: {},
    stats: {},
    ...(global.db.data || {})
  }
}

setInterval(async () => {
  if (global.db.data) await global.db.write(global.db.data)
}, 60 * 1000)

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

const __dirname = global.__dirname(import.meta.url)
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


const { state, saveCreds, closeConnection } = await useMongoDBAuthState(MONGODB_URI, DB_NAME)

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

// Run this after conn is created
await loadSessionOrPairing(conn);

//SAVE CREDS.JSON AND RELOAD THEM AFTER RESTART
if (fs.existsSync(CREDS_FILE)) {
  try {
    const savedAuth = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'))
    if (savedAuth?.creds) {
      conn.authState.creds = savedAuth.creds
      if (savedAuth.keys) {
        for (const [key, value] of Object.entries(savedAuth.keys)) {
          await conn.authState.keys.set(key, value)
        }
      }
      console.log(chalk.greenBright("✅ Session restored from creds.json"))
      return true
    }
  } catch (err) {
    console.error("❌ Failed to load creds.json:", err)
  }
}

if (!opts['test']) {
  if (global.db) {
    setInterval(async () => {
      if (global.db.data) await global.db.write(global.db.data)
if (opts['autocleartmp'] && (global.support || {}).find)
        (tmp = [os.tmpdir(), 'tmp']),
          tmp.forEach(filename =>
            cp.spawn('find', [filename, '-amin', '3', '-type', 'f', '-delete'])
          )
    }, 30 * 1000)
  }
}

if (opts['server']) (await import('./server.js')).default(global.conn, PORT)

async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin } = update
  global.stopped = connection

  if (isNewLogin) conn.isInit = true

  const code =
    lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode

  if (code && code !== DisconnectReason.loggedOut && conn?.ws.socket == null) {
    try {
      conn.logger.info(await global.reloadHandler(true))
    } catch (error) {
      console.error('Error reloading handler:', error)
    }
  }

  if (code && (code === DisconnectReason.restartRequired || code === 428)) {
    conn.logger.info(chalk.yellow('\n🌀 Restart Required... Preparing for restart'))
    
    try {
      if (global.db.data) {
        conn.logger.info(chalk.blue('Saving database before restart...'))
        await global.db.write(global.db.data)
        conn.logger.info(chalk.green('Database saved successfully'))
      }
    } catch (error) {
      console.error('Error saving database before restart:', error)
    }
    
    try {
      await global.db.read()
      conn.logger.info(chalk.green('MongoDB connection verified, proceeding with restart'))
    } catch (dbError) {
      conn.logger.error(chalk.red('MongoDB connection error before restart, attempting to reconnect...'))
      try {
        global.db = new MongoDB(MONGODB_URI)
        await global.db.read()
        conn.logger.info(chalk.green('Successfully reconnected to MongoDB'))
      } catch (reconnectError) {
        conn.logger.error(chalk.red('Failed to reconnect to MongoDB:'), reconnectError)
      }
    }
    
    if (process.send) {
      process.send('reset')
    } else {
      conn.logger.info(chalk.yellow('Reloading handler...'))
      await global.reloadHandler(true)
    }
  }

  if (global.db.data == null) loadDatabase()

  if (connection === 'open') {
    if (process.send) {
      process.send({ 
        type: 'connection-status', 
        connected: true 
      })
    }
    
    try {
      await global.db.read()
      conn.logger.info(chalk.green('MongoDB connection verified on open'))
    } catch (error) {
      conn.logger.error(chalk.red('MongoDB connection error on open, attempting to reconnect...'))
      try {
        global.db = new MongoDB(MONGODB_URI)
        await global.db.read()
        conn.logger.info(chalk.green('Successfully reconnected to MongoDB on open'))
      } catch (reconnectError) {
        conn.logger.error(chalk.red('Failed to reconnect to MongoDB on open:'), reconnectError)
      }
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
  }

  if (connection === 'close') {
    if (process.send) {
      process.send({ 
        type: 'connection-status', 
        connected: false 
      })
    }
    
    try {
      await global.db.read()
      conn.logger.info(chalk.blue('MongoDB connection maintained despite WhatsApp disconnection'))
    } catch (error) {
      conn.logger.error(chalk.red('MongoDB connection lost on WhatsApp disconnect, attempting to reconnect...'))
      try {
        global.db = new MongoDB(MONGODB_URI)
        await global.db.read()
        conn.logger.info(chalk.green('Successfully reconnected to MongoDB after disconnection'))
      } catch (reconnectError) {
        conn.logger.error(chalk.red('Failed to reconnect to MongoDB after disconnection:'), reconnectError)
      }
    }
    
    conn.logger.error(chalk.yellow(`\nConnection closed... Get a new session`))
  }
}

conn.ev.on('messaging-history.set', ({ messages }) => {
  if (messages && messages.length > 0) {
    mongoStore.saveMessages({ messages, type: 'append' }, DB_NAME)
  }
})
conn.ev.on('contacts.update', async (contacts) => {
  for (const contact of contacts) await mongoStore.saveContact(contact, DB_NAME)
})
conn.ev.on('contacts.upsert', async (contacts) => {
  for (const contact of contacts) await mongoStore.saveContact(contact, DB_NAME)
})
conn.ev.on('messages.upsert', ({ messages }) => {
  mongoStore.saveMessages({ messages, type: 'upsert' }, DB_NAME)
})
conn.ev.on('messages.update', async (messageUpdates) => {
  mongoStore.saveMessages({ messages: messageUpdates, type: 'update' }, DB_NAME)
})
conn.ev.on('message-receipt.update', async (messageReceipts) => {
  mongoStore.saveReceipts(messageReceipts, DB_NAME)
})
conn.ev.on('groups.update', async ([event]) => {
  if (event.id) {
    const metadata = await conn.groupMetadata(event.id)
    if (metadata) {
      groupMetadataCache.set(event.id, metadata)
      await mongoStore.saveGroupMetadata(event.id, metadata, DB_NAME).catch(() => {})
    }
  }
})
conn.ev.on('group-participants.update', async (event) => {
  if (event.id) {
    const metadata = await conn.groupMetadata(event.id)
    if (metadata) {
      groupMetadataCache.set(event.id, metadata)
      await mongoStore.saveGroupMetadata(event.id, metadata, DB_NAME).catch(() => {})
    }
  }
})

process.on('exit', async () => { await closeConnection() })
process.on('SIGINT', async () => { await closeConnection(); process.exit(0) })
process.on('SIGTERM', async () => { await closeConnection(); process.exit(0) })

process.on('uncaughtException', console.error)

let isInit = true
let handler = await import('./handler.js')
global.reloadHandler = async function (restatConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error)
    if (Object.keys(Handler || {}).length) handler = Handler
  } catch (error) {
    console.error
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

  const currentDateTime = new Date()
  const messageDateTime = new Date(conn.ev)
  if (currentDateTime >= messageDateTime) {
    const chats = Object.entries(conn.chats)
      .filter(([jid, chat]) => !jid.endsWith('@g.us') && chat.isChats)
      .map(v => v[0])
  } else {
    const chats = Object.entries(conn.chats)
      .filter(([jid, chat]) => !jid.endsWith('@g.us') && chat.isChats)
      .map(v => v[0])
  }

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
  for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
    try {
      const file = global.__filename(join(pluginFolder, filename))
      const module = await import(file)
      global.plugins[filename] = module.default || module
    } catch (e) {
      conn.logger.error(e)
      delete global.plugins[filename]
    }
  }
}
filesInit()
  .then(_ => Object.keys(global.plugins))
  .catch(console.error)

global.reload = async (_ev, filename) => {
  if (pluginFilter(filename)) {
    const dir = global.__filename(join(pluginFolder, filename), true)
    if (filename in global.plugins) {
      if (existsSync(dir)) conn.logger.info(`\nUpdated plugin - '${filename}'`)
      else {
        conn.logger.warn(`\nDeleted plugin - '${filename}'`)
        return delete global.plugins[filename]
      }
    } else conn.logger.info(`\nNew plugin - '${filename}'`)
    const err = syntaxerror(readFileSync(dir), filename, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    })
    if (err) conn.logger.error(`\nSyntax error while loading '${filename}'\n${format(err)}`)
    else {
      try {
        const module = await import(`${global.__filename(dir)}?update=${Date.now()}`)
        global.plugins[filename] = module.default || module
      } catch (e) {
        conn.logger.error(`\nError require plugin '${filename}\n${format(e)}'`)
      } finally {
        global.plugins = Object.fromEntries(
          Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
        )
      }
    }
  }
}
Object.freeze(global.reload)
watch(pluginFolder, global.reload)
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
${stats.topPlugins ? `│ 🔝 Top Plugins:               │\n${stats.topPlugins.map(p => `│   • ${padRight(p.name.replace('.js', ''), 20)} ${p.total} │`).join('\n')}` : ''}
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
        };
