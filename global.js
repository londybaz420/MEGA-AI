process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1';
import './config.js';

import dotenv from 'dotenv';
import { existsSync, readFileSync, readdirSync, unlinkSync, watch } from 'fs';
import { createRequire } from 'module';
import path, { join } from 'path';
import { platform } from 'process';
import { fileURLToPath, pathToFileURL } from 'url';
import * as ws from 'ws';
import SaveCreds from './lib/makesession.js';
import clearTmp from './lib/tempclear.js';

// Global definitions
global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix
    ? /file:\/\/\//.test(pathURL)
      ? fileURLToPath(pathURL)
      : pathURL
    : pathToFileURL(pathURL).toString();
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
import { JSONFile, Low } from 'lowdb';
import NodeCache from 'node-cache';
import { default as Pino, default as pino } from 'pino';
import syntaxerror from 'syntax-error';
import { format } from 'util';
import yargs from 'yargs';
import CloudDBAdapter from './lib/cloudDBAdapter.js';
import { mongoDB, mongoDBV2 } from './lib/mongoDB.js';
import { makeWASocket, protoType, serialize } from './lib/simple.js';

const {
  DisconnectReason,
  useMultiFileAuthState,
  MessageRetryMap,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  Browsers,
  proto,
  delay,
  jidNormalizedUser,
} = await (await import('@whiskeysockets/baileys')).default;

import readline from 'readline';
import os from 'os';
import cp from 'child_process';

dotenv.config();

// Session initialization
async function main() {
  const txt = global.SESSION_ID || process.env.SESSION_ID;

  if (!txt) {
    console.error('Environment variable SESSION_ID not found.');
    return;
  }

  try {
    await SaveCreds(txt);
    console.log('Session check completed.');
  } catch (error) {
    console.error('Error initializing session:', error);
  }
}

await main();
await delay(1000 * 5); // Reduced delay to 5 seconds

// Configuration
const pairingCode = !!global.pairingNumber || process.argv.includes('--pairing-code');
const useQr = process.argv.includes('--qr');
const useStore = true;

const MAIN_LOGGER = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` });
const logger = MAIN_LOGGER.child({});
logger.level = 'silent'; // Changed from 'fatal' to 'silent' for less verbose logging

const store = useStore ? makeInMemoryStore({ logger }) : undefined;

// Store management with error handling
if (store) {
  try {
    store.readFromFile('./session.json');
  } catch (error) {
    console.log('No existing session store found, creating new one.');
  }

  setInterval(() => {
    try {
      store.writeToFile('./session.json');
    } catch (error) {
      console.error('Error writing store to file:', error);
    }
  }, 30000); // Increased interval to 30 seconds
}

const msgRetryCounterCache = new NodeCache();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = text => new Promise(resolve => rl.question(text, resolve));

const { CONNECTING } = ws;
const { chain } = lodash;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

protoType();
serialize();

global.API = (name, path = '/', query = {}, apikeyqueryname) =>
  (name in global.APIs ? global.APIs[name] : name) +
  path +
  (query || apikeyqueryname
    ? '?' +
      new URLSearchParams(
        Object.entries({
          ...query,
          ...(apikeyqueryname
            ? {
                [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name],
              }
            : {}),
        })
      )
    : '');
    
global.timestamp = {
  start: new Date(),
};

const __dirname = global.__dirname(import.meta.url);
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp(
  '^[' +
    (process.env.PREFIX || '*/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-.@').replace(
      /[|\\{}()[\]^$+*?.\-\^]/g,
      '\\$&'
    ) +
    ']'
);
global.opts['db'] = process.env.DATABASE_URL;

// Database initialization with better error handling
try {
  global.db = new Low(
    /https?:\/\//.test(opts['db'] || '') ?
      new CloudDBAdapter(opts['db']) : /mongodb(\+srv)?:\/\//i.test(opts['db']) ?
        (opts['mongodbv2'] ? new mongoDBV2(opts['db']) : new mongoDB(opts['db'])) :
        new JSONFile(`${opts._[0] ? opts._[0] + '_' : ''}database.json`)
  );
} catch (error) {
  console.error('Database initialization error:', error);
  // Fallback to JSON file
  global.db = new Low(new JSONFile('database.json'));
}

global.DATABASE = global.db;

global.loadDatabase = async function loadDatabase() {
  if (global.db.READ) {
    return new Promise((resolve) => {
      const interval = setInterval(async function () {
        if (!global.db.READ) {
          clearInterval(interval);
          resolve(global.db.data == null ? global.loadDatabase() : global.db.data);
        }
      }, 1 * 1000);
    });
  }
  
  if (global.db.data !== null) return;
  
  global.db.READ = true;
  try {
    await global.db.read();
  } catch (error) {
    console.error('Error reading database:', error);
    global.db.data = {};
  }
  global.db.READ = null;
  
  global.db.data = {
    users: {},
    chats: {},
    stats: {},
    msgs: {},
    sticker: {},
    settings: {},
    ...(global.db.data || {})
  };
  global.db.chain = chain(global.db.data);
};

await loadDatabase();

global.authFolder = `session`;
let state, saveCreds;

try {
  const authState = await useMultiFileAuthState(global.authFolder);
  state = authState.state;
  saveCreds = authState.saveCreds;
} catch (error) {
  console.error('Error initializing auth state:', error);
  process.exit(1);
}

// Connection options with better error handling
const connectionOptions = {
  version: [2, 3000, 1015901307],
  logger: Pino({ level: 'silent' }),
  printQRInTerminal: !pairingCode,
  browser: Browsers.macOS("Safari"),
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'silent' })),
  },
  markOnlineOnConnect: true,
  generateHighQualityLinkPreview: true,
  getMessage: async key => {
    try {
      let jid = jidNormalizedUser(key.remoteJid);
      let msg = await store.loadMessage(jid, key.id);
      return msg?.message || '';
    } catch (error) {
      return '';
    }
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
  defaultQueryTimeoutMs: undefined,
  syncFullHistory: false,
  connectTimeoutMs: 60000, // Added connection timeout
  keepAliveIntervalMs: 10000, // Added keep alive
};

global.conn = makeWASocket(connectionOptions);
conn.isInit = false;

if (store) {
  try {
    store.bind(conn.ev);
  } catch (error) {
    console.error('Error binding store to connection:', error);
  }
}

// Pairing code logic
if (pairingCode && !conn.authState.creds.registered) {
  let phoneNumber;
  
  if (!!global.pairingNumber) {
    phoneNumber = global.pairingNumber.replace(/[^0-9]/g, '');
  } else {
    phoneNumber = await question(
      chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number : `))
    );
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
  }

  setTimeout(async () => {
    try {
      let code = await conn.requestPairingCode(phoneNumber);
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      const pairingCodeMsg =
        chalk.bold.greenBright('Your Pairing Code:') + ' ' + chalk.bgGreenBright(chalk.black(code));
      console.log(pairingCodeMsg);
    } catch (error) {
      console.error('Error requesting pairing code:', error);
    }
  }, 3000);
}

conn.logger.info('\nWaiting For Login\n');

// Database autosave and cleanup
if (!opts['test']) {
  if (global.db) {
    setInterval(async () => {
      try {
        if (global.db.data) await global.db.write();
        
        if (opts['autocleartmp'] && (global.support || {}).find) {
          const tmp = [os.tmpdir(), 'tmp'];
          tmp.forEach(filename => {
            try {
              cp.spawn('find', [filename, '-amin', '3', '-type', 'f', '-delete']);
            } catch (error) {
              console.error('Error cleaning tmp files:', error);
            }
          });
        }
      } catch (error) {
        console.error('Error in maintenance tasks:', error);
      }
    }, 60 * 1000); // Increased to 1 minute
  }
}

// Server initialization
if (opts['server']) {
  try {
    (await import('./server.js')).default(global.conn, PORT);
  } catch (error) {
    console.error('Error starting server:', error);
  }
}

// Cleanup function with better error handling
function runCleanup() {
  clearTmp()
    .then(() => {
      console.log('Temporary file cleanup completed.');
    })
    .catch(error => {
      console.error('An error occurred during temporary file cleanup:', error);
    })
    .finally(() => {
      setTimeout(runCleanup, 1000 * 60 * 5); // Reduced to 5 minutes
    });
}

runCleanup();

function clearsession() {
  try {
    const directorio = readdirSync('./session');
    const filesFolderPreKeys = directorio.filter(file => file.startsWith('pre-key-'));
    
    filesFolderPreKeys.forEach(files => {
      try {
        unlinkSync(`./session/${files}`);
      } catch (error) {
        console.error(`Error deleting file ${files}:`, error);
      }
    });
  } catch (error) {
    console.error('Error clearing session:', error);
  }
}

// Connection update handler with better error recovery
async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin, qr } = update;
  global.stopped = connection;

  if (isNewLogin) conn.isInit = true;

  const code = lastDisconnect?.error?.output?.statusCode || 
              lastDisconnect?.error?.output?.payload?.statusCode;

  if (code && code !== DisconnectReason.loggedOut && conn?.ws.socket == null) {
    console.log(`Connection closed with code: ${code}, attempting to reconnect...`);
    
    try {
      await global.reloadHandler(true).catch(console.error);
    } catch (error) {
      console.error('Error reloading handler:', error);
      
      // Additional recovery attempt
      setTimeout(() => {
        console.log('Attempting to restart connection...');
        process.send('reset');
      }, 5000);
    }
  }

  if (code && (code === DisconnectReason.restartRequired || code === 428)) {
    console.log(chalk.yellow('\n🌀 Restart Required... Restarting'));
    process.send('reset');
  }

  // Load database if not loaded
  if (global.db.data == null) {
    try {
      await loadDatabase();
    } catch (error) {
      console.error('Error loading database:', error);
    }
  }

  if (!pairingCode && useQr && qr !== 0 && qr !== undefined) {
    console.log(chalk.yellow('\nScan the QR code to login...'));
  }

  if (connection === 'open') {
    console.log(chalk.green('\n✅ Connected successfully!'));
    
    try {
      const { jid, name } = conn.user;
      const msg = `*TOHID-KHAN Connected* \n\n *Prefix  : [ . ]* \n\n *Plugins : 340* \n\n *SUPPORT BY FOLLOW*
*https://GitHub.com/Tohidkhan6332*`;

      await conn.sendMessage(jid, { text: msg, mentions: [jid] }, { quoted: null });
      console.log(chalk.yellow('\n👍 B O T  R E A D Y'));
    } catch (error) {
      console.error('Error sending connection message:', error);
    }
  }

  if (connection === 'close') {
    console.log(chalk.yellow(`\nConnection closed. Reason: ${lastDisconnect?.error?.message || 'Unknown'}`));
    
    // Attempt to reconnect after a delay
    setTimeout(() => {
      console.log(chalk.blue('Attempting to reconnect...'));
      process.send('reset');
    }, 5000);
  }
}

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

let isInit = true;
let handler;

try {
  handler = await import('./handler.js');
} catch (error) {
  console.error('Error loading handler:', error);
  process.exit(1);
}

global.reloadHandler = async function (restartConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
    if (Handler && Object.keys(Handler).length) {
      handler = Handler;
    }
  } catch (error) {
    console.error('Error reloading handler:', error);
  }
  
  if (restartConn) {
    const oldChats = global.conn.chats;
    try {
      global.conn.ws.close();
    } catch (error) {
      console.error('Error closing connection:', error);
    }
    
    conn.ev.removeAllListeners();
    
    try {
      global.conn = makeWASocket(connectionOptions, {
        chats: oldChats,
      });
    } catch (error) {
      console.error('Error recreating connection:', error);
      // Try to reconnect after a delay
      setTimeout(() => process.send('reset'), 5000);
      return false;
    }
    
    isInit = true;
  }
  
  if (!isInit) {
    // Remove old listeners
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
  conn.welcome = ` Hello @user!\n\n🎉 *WELCOME* to the group @group!\n\n📜 Please read the *DESCRIPTION* @desc.`;
  conn.bye = `👋GOODBYE @user \n\nSee you later!`;
  conn.spromote = `*@user* has been promoted to an admin!`;
  conn.sdemote = `*@user* is no longer an admin.`;
  conn.sDesc = `The group description has been updated to:\n@desc`;
  conn.sSubject = `The group title has been changed to:\n@group`;
  conn.sIcon = `The group icon has been updated!`;
  conn.sRevoke = ` The group link has been changed to:\n@revoke`;
  conn.sAnnounceOn = `The group is now *CLOSED*!\nOnly admins can send messages.`;
  conn.sAnnounceOff = `The group is now *OPEN*!\nAll participants can send messages.`;
  conn.sRestrictOn = `Edit Group Info has been restricted to admins only!`;
  conn.sRestrictOff = `Edit Group Info is now available to all participants!`;

  // Bind handlers
  conn.handler = handler.handler.bind(global.conn);
  conn.pollUpdate = handler.pollUpdate.bind(global.conn);
  conn.participantsUpdate = handler.participantsUpdate.bind(global.conn);
  conn.groupsUpdate = handler.groupsUpdate.bind(global.conn);
  conn.onDelete = handler.deleteUpdate.bind(global.conn);
  conn.presenceUpdate = handler.presenceUpdate.bind(global.conn);
  conn.connectionUpdate = connectionUpdate.bind(global.conn);
  conn.credsUpdate = saveCreds.bind(global.conn, true);

  // Add event listeners
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

// Plugin loading with better error handling
const pluginFolder = global.__dirname(join(__dirname, './plugins/index'));
const pluginFilter = filename => /\.js$/.test(filename);
global.plugins = {};

async function filesInit() {
  try {
    const files = readdirSync(pluginFolder).filter(pluginFilter);
    
    for (const filename of files) {
      try {
        const file = global.__filename(join(pluginFolder, filename));
        const module = await import(file);
        global.plugins[filename] = module.default || module;
      } catch (e) {
        console.error(`Error loading plugin ${filename}:`, e);
        delete global.plugins[filename];
      }
    }
  } catch (error) {
    console.error('Error reading plugin directory:', error);
  }
}

await filesInit();

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
    
    try {
      const err = syntaxerror(readFileSync(dir), filename, {
        sourceType: 'module',
        allowAwaitOutsideFunction: true,
      });
      
      if (err) {
        console.error(`\nSyntax error while loading '${filename}':\n${format(err)}`);
        return;
      }
      
      const module = await import(`${global.__filename(dir)}?update=${Date.now()}`);
      global.plugins[filename] = module.default || module;
      
      // Sort plugins alphabetically
      global.plugins = Object.fromEntries(
        Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
      );
    } catch (e) {
      console.error(`\nError loading plugin '${filename}':\n${format(e)}`);
    }
  }
};

Object.freeze(global.reload);

// Watch for plugin changes
try {
  watch(pluginFolder, global.reload);
} catch (error) {
  console.error('Error setting up plugin watcher:', error);
}

await global.reloadHandler();

// Quick test for dependencies
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
  const s = (global.support = {
    ffmpeg,
    ffprobe,
    ffmpegWebp,
    convert,
    magick,
    gm,
    find,
  });
  
  Object.freeze(global.support);
}

// Session cleanup function
async function saafsafai() {
  if (global.stopped === 'close' || !conn || !conn.user) return;
  clearsession();
  console.log(chalk.cyanBright('\nStored Sessions Cleared'));
}

// Run session cleanup every 15 minutes instead of 10
setInterval(saafsafai, 15 * 60 * 1000);

// Run quick test
_quickTest().catch(console.error);

console.log(chalk.green('Bot initialization completed successfully!'));
