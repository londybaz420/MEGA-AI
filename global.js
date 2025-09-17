process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'; // Use '1' for production

import './config.js';
import dotenv from 'dotenv';
import { existsSync, readFileSync, readdirSync, unlinkSync, watch, writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import path, { join } from 'path';
import { platform } from 'process';
import { fileURLToPath, pathToFileURL } from 'url';
import * as ws from 'ws';
import { useMongoDBAuthState } from './auth/mongo-auth.js';
import * as mongoStore from './auth/mongo-store.js';
import NodeCache from 'node-cache';
import { MongoDB } from './lib/mongoDB.js';

// Global filename/dirname helpers
global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};
global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true));
};
global.__require = function require(dir = import.meta.url) {
  return createRequire(dir);
};

global.gurubot = 'https://www.guruapi.tech/api';

import chalk from 'chalk';
import { spawn } from 'child_process';
import lodash from 'lodash';
import { default as Pino, default as pino } from 'pino';
import syntaxerror from 'syntax-error';
import { format } from 'util';
import yargs from 'yargs';
import PHONENUMBER_MCC from './lib/mcc.js';
import { makeWASocket, protoType, serialize } from './lib/simple.js';

const { DisconnectReason, MessageRetryMap, fetchLatestWaWebVersion, Browsers, makeCacheableSignalKeyStore, proto, delay, jidNormalizedUser } = await (await import('baileys-pro')).default;

dotenv.config();

const groupMetadataCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'guru_bot';

const globalDB = new MongoDB(MONGODB_URI);
global.db = globalDB;

global.loadDatabase = async function loadDatabase() {
  await global.db.read();
  global.db.data = {
    users: {},
    chats: {},
    settings: {},
    stats: {},
    ...(global.db.data || {})
  };
};

setInterval(async () => {
  if (global.db.data) await global.db.write(global.db.data);
}, 60 * 1000);

await global.loadDatabase();

const MAIN_LOGGER = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`
});

const logger = MAIN_LOGGER.child({});
logger.level = 'silent';

const msgRetryCounterCache = new NodeCache();

const { CONNECTING } = ws;
const { chain } = lodash;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

protoType();
serialize();

global.API = (name, path = '/', query = {}) => name + path + (query ? '?' + new URLSearchParams(Object.entries(query)) : '');
global.timestamp = { start: new Date() };

const __dirname = global.__dirname(import.meta.url);
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp(
  '^[' +
    (process.env.PREFIX || '*/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-.@').replace(
      /[|\\{}()[\]^$+*?.\-\^]/g, '\\$&'
    ) + ']'
);
global.opts['db'] = process.env.MONGODB_URI;

// Session ID authentication logic
let sessionAuth = null;
const SESSION_ID = process.env.SESSION_ID;

// Function to decode and save session
function decodeAndSaveSession() {
  if (!SESSION_ID) {
    console.log(chalk.yellow('⚠️ SESSION_ID environment variable is not set'));
    return null;
  }

  try {
    // Remove the EDITH-MD~ prefix if present and decode the base64 session
    const base64Session = SESSION_ID.startsWith('EDITH-MD~') 
      ? SESSION_ID.replace('EDITH-MD~', '') 
      : SESSION_ID;
    
    const decodedSession = Buffer.from(base64Session, 'base64').toString('utf-8');
    const sessionData = JSON.parse(decodedSession);
    
    // Ensure session directory exists
    const sessionDir = './session';
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
    
    // Save session to file
    writeFileSync(join(sessionDir, 'creds.json'), JSON.stringify(sessionData.creds || {}, null, 2));
    
    console.log(chalk.green('✓ Session decoded and saved successfully'));
    return sessionData;
  } catch (error) {
    console.log(chalk.red('✗ Failed to parse SESSION_ID:'), error.message);
    return null;
  }
}

// Decode session on startup
sessionAuth = decodeAndSaveSession();

const { state, saveCreds, closeConnection } = await useMongoDBAuthState(MONGODB_URI, DB_NAME);

// If we have a valid session from SESSION_ID, use it instead of MongoDB auth
if (sessionAuth && sessionAuth.creds) {
  // Override the state with the session data
  state.creds = { ...state.creds, ...sessionAuth.creds };
  
  if (sessionAuth.keys) {
    state.keys = { ...state.keys, ...sessionAuth.keys };
  }

  console.log(chalk.blue('Using session authentication from SESSION_ID'));
} else {
  console.log(chalk.yellow('Using MongoDB authentication as fallback'));
}

const connectionOptions = {
  logger: Pino({ level: 'silent' }),
  printQRInTerminal: !sessionAuth, // Only show QR if no valid session
  version: [2, 3000, 1023223821],
  browser: Browsers.ubuntu('Chrome'),
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(
      state.keys,
      Pino().child({ level: 'silent', stream: 'store' })
    ),
  },
  markOnlineOnConnect: true,
  generateHighQualityLinkPreview: true,
  cachedGroupMetadata: async (jid) => {
    const cached = groupMetadataCache.get(jid);
    if (cached) return cached;
    try {
      const mongoMeta = await mongoStore.groupMetadata(jid, DB_NAME);
      if (mongoMeta) groupMetadataCache.set(jid, mongoMeta);
      return mongoMeta || null;
    } catch (e) {
      return null;
    }
  },
  getMessage: async key => {
    let jid = jidNormalizedUser(key.remoteJid);
    let msg = await mongoStore.loadMessage(key.id, jid, DB_NAME);
    return msg?.message || '';
  },
  patchMessageBeforeSending: message => {
    const requiresPatch = !!(
      message.buttonsMessage ||
      message.templateMessage ||
      message.listMessage
    );
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
      };
    }
    return message;
  },
  msgRetryCounterCache,
  defaultQueryTimeoutMs: 0,
  syncFullHistory: false,
};

global.conn = makeWASocket(connectionOptions);
conn.isInit = false;

// Connection update handler
async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin } = update;
  global.stopped = connection;

  if (isNewLogin) conn.isInit = true;

  const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode;

  if (code && code !== DisconnectReason.loggedOut && conn?.ws.socket == null) {
    try {
      console.log(chalk.yellow('🔄 Attempting to reconnect...'));
      await global.reloadHandler(true);
    } catch (error) {
      console.error('Error reloading handler:', error);
    }
  }

  if (code && (code === DisconnectReason.restartRequired || code === 428)) {
    console.log(chalk.yellow('\n🌀 Restart Required... Preparing for restart'));
  }

  if (global.db.data == null) await global.loadDatabase();

  if (connection === 'open') {
    console.log(chalk.green('✅ Connection opened successfully'));
    
    if (process.send) {
      process.send({
        type: 'connection-status',
        connected: true
      });
    }
  }

  if (connection === 'close') {
    console.log(chalk.red('❌ Connection closed'));
    
    if (process.send) {
      process.send({
        type: 'connection-status',
        connected: false,
        error: `Connection closed with code: ${code}`
      });
    }

    // Auto-restart logic
    if (code !== DisconnectReason.loggedOut) {
      console.log(chalk.yellow('🔄 Attempting to reconnect in 5 seconds...'));
      setTimeout(() => {
        global.reloadHandler(true).catch(console.error);
      }, 5000);
    }
  }
}

// Event handlers
conn.ev.on('messaging-history.set', ({ messages }) => {
  if (messages && messages.length > 0) {
    mongoStore.saveMessages({ messages, type: 'append' }, DB_NAME);
  }
});

conn.ev.on('contacts.update', async (contacts) => {
  for (const contact of contacts) await mongoStore.saveContact(contact, DB_NAME);
});

conn.ev.on('contacts.upsert', async (contacts) => {
  for (const contact of contacts) await mongoStore.saveContact(contact, DB_NAME);
});

conn.ev.on('messages.upsert', ({ messages }) => {
  mongoStore.saveMessages({ messages, type: 'upsert' }, DB_NAME);
});

conn.ev.on('messages.update', async (messageUpdates) => {
  mongoStore.saveMessages({ messages: messageUpdates, type: 'update' }, DB_NAME);
});

conn.ev.on('message-receipt.update', async (messageReceipts) => {
  mongoStore.saveReceipts(messageReceipts, DB_NAME);
});

conn.ev.on('groups.update', async ([event]) => {
  if (event.id) {
    const metadata = await conn.groupMetadata(event.id);
    if (metadata) {
      groupMetadataCache.set(event.id, metadata);
      await mongoStore.saveGroupMetadata(event.id, metadata, DB_NAME).catch(() => {});
    }
  }
});

conn.ev.on('group-participants.update', async (event) => {
  if (event.id) {
    const metadata = await conn.groupMetadata(event.id);
    if (metadata) {
      groupMetadataCache.set(event.id, metadata);
      await mongoStore.saveGroupMetadata(event.id, metadata, DB_NAME).catch(() => {});
    }
  }
});

// Process event handlers
process.on('exit', async () => {
  await closeConnection();
});

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n🛑 Received SIGINT, shutting down gracefully...'));
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down gracefully...'));
  await closeConnection();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
});

// Handler loading
let isInit = true;
let handler = await import('./handler.js');

global.reloadHandler = async function (restartConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
    if (Object.keys(Handler || {}).length) handler = Handler;
  } catch (error) {
    console.error('Error reloading handler:', error);
  }
  
  if (restartConn) {
    const oldChats = global.conn.chats;
    try {
      global.conn.ws.close();
    } catch {}
    
    conn.ev.removeAllListeners();
    global.conn = makeWASocket(connectionOptions, { chats: oldChats });
    isInit = true;
  }
  
  if (!isInit) {
    conn.ev.off('messages.upsert', conn.handler);
    conn.ev.off('messages.update', conn.pollUpdate);
    conn.ev.off('group-participants.update', conn.participantsUpdate);
    conn.ev.off('groups.update', conn.groupsUpdate);
    conn.ev.off('message.delete', conn.onDelete);
    conn.ev.off('presence.update', conn.presenceUpdate);
    conn.ev.off('connection.update', conn.connectionUpdate);
    conn.ev.off('creds.update', conn.credsUpdate);
  }

  // Default messages
  conn.welcome = 'Hello @user!\n\n🎉 WELCOME to the group @group!\n\n📜 Please read the DESCRIPTION @desc.';
  conn.bye = '👋 GOODBYE @user \n\nSee you later!';
  conn.spromote = '@user has been promoted to an admin!';
  conn.sdemote = '@user is no longer an admin.';
  conn.sDesc = 'The group description has been updated to:\n@desc';
  conn.sSubject = 'The group title has been changed to:\n@group';
  conn.sIcon = 'The group icon has been updated!';
  conn.sRevoke = 'The group link has been changed to:\n@revoke';
  conn.sAnnounceOn = 'The group is now CLOSED!\nOnly admins can send messages.';
  conn.sAnnounceOff = 'The group is now OPEN!\nAll participants can send messages.';
  conn.sRestrictOn = 'Edit Group Info has been restricted to admins only!';
  conn.sRestrictOff = 'Edit Group Info is now available to all participants!';

  // Bind handlers
  conn.handler = handler.handler.bind(global.conn);
  conn.pollUpdate = handler.pollUpdate.bind(global.conn);
  conn.participantsUpdate = handler.participantsUpdate.bind(global.conn);
  conn.groupsUpdate = handler.groupsUpdate.bind(global.conn);
  conn.onDelete = handler.deleteUpdate.bind(global.conn);
  conn.presenceUpdate = handler.presenceUpdate.bind(global.conn);
  conn.connectionUpdate = connectionUpdate.bind(global.conn);
  conn.credsUpdate = saveCreds.bind(global.conn, true);

  // Event listeners
  conn.ev.on('messages.upsert', conn.handler);
  conn.ev.on('messages.update', conn.pollUpdate);
  conn.ev.on('group-participants.update', conn.participantsUpdate);
  conn.ev.on('groups.update', conn.groupsUpdate);
  conn.ev.on('message.delete', conn.onDelete);
  conn.ev.on('presence.update', conn.presenceUpdate);
  conn.ev.on('connection.update', conn.connectionUpdate);
  conn.ev.on('creds.update', conn.credsUpdate);
  
  isInit = false;
  return true;
};

// Plugin loading
const pluginFolder = global.__dirname(join(__dirname, './plugins/index'));
const pluginFilter = filename => /\.js$/.test(filename);
global.plugins = {};

async function filesInit() {
  for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
    try {
      const file = global.__filename(join(pluginFolder, filename));
      const module = await import(file);
      global.plugins[filename] = module.default || module;
    } catch (e) {
      console.error('Error loading plugin:', e);
      delete global.plugins[filename];
    }
  }
}

await filesInit().catch(console.error);

global.reload = async (_ev, filename) => {
  if (pluginFilter(filename)) {
    const dir = global.__filename(join(pluginFolder, filename), true);
    if (filename in global.plugins) {
      if (existsSync(dir)) {
        console.log(`\nUpdated plugin - '${filename}'`);
      } else {
        console.log(`\nDeleted plugin - '${filename}'`);
        return delete global.plugins[filename];
      }
    } else {
      console.log(`\nNew plugin - '${filename}'`);
    }
    
    const err = syntaxerror(readFileSync(dir), filename, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    });
    
    if (err) {
      console.error(`\nSyntax error while loading '${filename}'\n${format(err)}`);
    } else {
      try {
        const module = await import(`${global.__filename(dir)}?update=${Date.now()}`);
        global.plugins[filename] = module.default || module;
      } catch (e) {
        console.error(`\nError requiring plugin '${filename}'\n${format(e)}`);
      } finally {
        global.plugins = Object.fromEntries(
          Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
        );
      }
    }
  }
};

Object.freeze(global.reload);
watch(pluginFolder, global.reload);

// Initialize
await global.reloadHandler();

// Quick test for dependencies
async function _quickTest() {
  const test = await Promise.all(
    [
      spawn('ffmpeg'),
      spawn('ffprobe'),
      spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
      spawn('convert'),
      spawn('magick'),
      spawn('gm'),
      spawn('find', ['--version']),
    ].map(p => {
      return Promise.race([
        new Promise(resolve => {
          p.on('close', code => {
            resolve(code !== 127);
          });
        }),
        new Promise(resolve => {
          p.on('error', _ => resolve(false));
        }),
      ]);
    })
  );
  
  const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test;
  const s = (global.support = { ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find });
  Object.freeze(global.support);
}

_quickTest().catch(console.error);

console.log(chalk.green('🤖 MEGA AI Bot started successfully!'));
