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
} = await (await import('baileys-pro')).default;

import readline from 'readline';
import os from 'os';
import cp from 'child_process';

dotenv.config();

// Enhanced session initialization with retry mechanism
async function main() {
  const txt = global.SESSION_ID || process.env.SESSION_ID;

  if (!txt) {
    console.error('❌ Environment variable SESSION_ID not found.');
    process.exit(1);
  }

  let retries = 3;
  while (retries > 0) {
    try {
      await SaveCreds(txt);
      console.log('✅ Session check completed successfully.');
      return;
    } catch (error) {
      retries--;
      console.error(`❌ Error initializing session (${retries} retries left):`, error.message);
      if (retries === 0) {
        console.error('❌ Failed to initialize session after multiple attempts');
        process.exit(1);
      }
      await delay(2000);
    }
  }
}

await main();
await delay(2000);

// Configuration
const pairingCode = !!global.pairingNumber || process.argv.includes('--pairing-code');
const useQr = process.argv.includes('--qr');
const useStore = true;

const MAIN_LOGGER = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` });
const logger = MAIN_LOGGER.child({});
logger.level = 'silent';

// Store management with enhanced error handling
let store;
try {
  store = useStore ? makeInMemoryStore({ logger }) : undefined;
  
  if (store) {
    try {
      store.readFromFile('./session.json');
      console.log('✅ Session store loaded successfully');
    } catch (error) {
      console.log('ℹ️ No existing session store found, creating new one');
    }

    setInterval(() => {
      try {
        store.writeToFile('./session.json');
      } catch (error) {
        console.error('❌ Error writing store to file:', error.message);
      }
    }, 30000);
  }
} catch (error) {
  console.error('❌ Error creating store:', error.message);
  store = undefined;
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

// Enhanced database initialization
try {
  global.db = new Low(
    /https?:\/\//.test(opts['db'] || '') ?
      new CloudDBAdapter(opts['db']) : /mongodb(\+srv)?:\/\//i.test(opts['db']) ?
        (opts['mongodbv2'] ? new mongoDBV2(opts['db']) : new mongoDB(opts['db'])) :
        new JSONFile(`${opts._[0] ? opts._[0] + '_' : ''}database.json`)
  );
  console.log('✅ Database initialized successfully');
} catch (error) {
  console.error('❌ Database initialization error:', error.message);
  global.db = new Low(new JSONFile('database.json'));
  console.log('✅ Fallback to JSON database');
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
      }, 1000);
    });
  }
  
  if (global.db.data !== null) return;
  
  global.db.READ = true;
  try {
    await global.db.read();
  } catch (error) {
    console.error('❌ Error reading database:', error.message);
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
  console.log('✅ Auth state initialized successfully');
} catch (error) {
  console.error('❌ Error initializing auth state:', error.message);
  process.exit(1);
}

// Enhanced connection options with better timeout handling
const connectionOptions = {
  version: (await fetchLatestWaWebVersion()).version,
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
      let msg = store ? await store.loadMessage(jid, key.id) : null;
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
  defaultQueryTimeoutMs: 20000,
  connectTimeoutMs: 30000,
  keepAliveIntervalMs: 15000,
  syncFullHistory: false,
  transactionOpts: { maxRetries: 3, delayBetweenTries: 1000 },
  retryRequestDelayMs: 1000,
  maxMsgRetryCount: 3,
};

let globalConn;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

async function createConnection() {
  try {
    connectionAttempts++;
    console.log(`🔗 Connection attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`);
    
    global.conn = makeWASocket(connectionOptions);
    global.conn.isInit = false;
    globalConn = global.conn;

    if (store) {
      try {
        store.bind(global.conn.ev);
      } catch (error) {
        console.error('❌ Error binding store to connection:', error.message);
      }
    }

    return global.conn;
  } catch (error) {
    console.error('❌ Error creating connection:', error.message);
    throw error;
  }
}

// Pairing code logic
if (pairingCode && (!state.creds.registered || connectionAttempts === 0)) {
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
      let code = await global.conn.requestPairingCode(phoneNumber);
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      const pairingCodeMsg =
        chalk.bold.greenBright('Your Pairing Code:') + ' ' + chalk.bgGreenBright(chalk.black(code));
      console.log(pairingCodeMsg);
    } catch (error) {
      console.error('❌ Error requesting pairing code:', error.message);
    }
  }, 3000);
}

console.log('\n⏳ Waiting For Login\n');

// Database autosave and cleanup
if (!opts['test']) {
  setInterval(async () => {
    try {
      if (global.db.data) await global.db.write();
    } catch (error) {
      console.error('❌ Error writing database:', error.message);
    }
  }, 60000);
}

// Server initialization
if (opts['server']) {
  try {
    (await import('./server.js')).default(global.conn, PORT);
  } catch (error) {
    console.error('❌ Error starting server:', error.message);
  }
}

// Enhanced cleanup function
function runCleanup() {
  clearTmp()
    .then(() => {
      console.log('✅ Temporary file cleanup completed');
    })
    .catch(error => {
      console.error('❌ Temporary file cleanup error:', error.message);
    })
    .finally(() => {
      setTimeout(runCleanup, 300000);
    });
}

runCleanup();

function clearsession() {
  try {
    if (existsSync('./session')) {
      const directorio = readdirSync('./session');
      const filesFolderPreKeys = directorio.filter(file => file.startsWith('pre-key-'));
      
      filesFolderPreKeys.forEach(file => {
        try {
          unlinkSync(`./session/${file}`);
        } catch (error) {
          console.error(`❌ Error deleting file ${file}:`, error.message);
        }
      });
    }
  } catch (error) {
    console.error('❌ Error clearing session:', error.message);
  }
}

// Enhanced connection update handler
async function connectionUpdate(update) {
  const { connection, lastDisconnect, isNewLogin, qr } = update;
  global.stopped = connection;

  if (isNewLogin) {
    global.conn.isInit = true;
    console.log('🔄 New login detected');
  }

  const code = lastDisconnect?.error?.output?.statusCode || 
              lastDisconnect?.error?.output?.payload?.statusCode;

  console.log(`🔄 Connection status: ${connection}, Code: ${code || 'N/A'}`);

  // Handle connection closure with specific error codes
  if (connection === 'close') {
    console.log(`🔴 Connection closed. Reason: ${lastDisconnect?.error?.message || 'Unknown'}`);
    
    if (code === 405) {
      console.log('⚠️  Code 405: Method Not Allowed - Usually temporary server issue');
      console.log('🔄 Attempting to reconnect in 5 seconds...');
      
      setTimeout(async () => {
        try {
          await global.reloadHandler(true);
        } catch (error) {
          console.error('❌ Error in reload handler:', error.message);
        }
      }, 5000);
    }
    else if (code === DisconnectReason.restartRequired || code === 428) {
      console.log('🔄 Restart Required... Restarting in 3 seconds');
      setTimeout(() => process.send('reset'), 3000);
    }
    else if (code === DisconnectReason.connectionLost || code === DisconnectReason.connectionReplaced) {
      console.log('🔄 Connection lost/replaced, reconnecting...');
      setTimeout(async () => {
        try {
          await global.reloadHandler(true);
        } catch (error) {
          console.error('❌ Error reconnecting:', error.message);
        }
      }, 3000);
    }
    else if (code === DisconnectReason.loggedOut) {
      console.log('❌ Logged out from WhatsApp. Need new session.');
      clearsession();
      process.exit(1);
    }
  }

  // Load database if not loaded
  if (global.db.data == null) {
    try {
      await loadDatabase();
    } catch (error) {
      console.error('❌ Error loading database:', error.message);
    }
  }

  if (!pairingCode && useQr && qr !== 0 && qr !== undefined) {
    console.log('📱 Scan the QR code to login...');
  }

  if (connection === 'open') {
    console.log('✅ Connected successfully!');
    connectionAttempts = 0;
    
    try {
      const { jid, name } = global.conn.user;
      const msg = `*TOHID-KHAN Connected* \n\n *Prefix  : [ . ]* \n\n *Plugins : 340* \n\n *SUPPORT BY FOLLOW*\n*https://GitHub.com/Tohidkhan6332*`;

      await global.conn.sendMessage(jid, { text: msg, mentions: [jid] }, { quoted: null });
      console.log('🤖 B O T   R E A D Y');
    } catch (error) {
      console.error('❌ Error sending connection message:', error.message);
    }
  }
}

// Enhanced error handlers
process.on('uncaughtException', error => {
  console.error('💥 Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

// Process signal handlers
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

let isInit = true;
let handler;

try {
  handler = await import('./handler.js');
  console.log('✅ Handler loaded successfully');
} catch (error) {
  console.error('❌ Error loading handler:', error.message);
  process.exit(1);
}

global.reloadHandler = async function (restartConn) {
  try {
    const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
    if (Handler && Object.keys(Handler).length) {
      handler = Handler;
      console.log('✅ Handler reloaded successfully');
    }
  } catch (error) {
    console.error('❌ Error reloading handler:', error.message);
  }
  
  if (restartConn) {
    console.log('🔄 Restarting connection...');
    const oldChats = global.conn.chats;
    
    try {
      if (global.conn.ws) {
        global.conn.ws.close();
      }
    } catch (error) {
      console.error('❌ Error closing connection:', error.message);
    }
    
    // Remove all listeners
    const events = [
      'messages.upsert', 'messages.update', 'group-participants.update',
      'groups.update', 'message.delete', 'presence.update',
      'connection.update', 'creds.update'
    ];
    
    events.forEach(event => {
      try {
        global.conn.ev.removeAllListeners(event);
      } catch (error) {
        // Ignore errors for events that might not have listeners
      }
    });
    
    // Create new connection
    try {
      global.conn = makeWASocket(connectionOptions, {
        chats: oldChats,
      });
      globalConn = global.conn;
      isInit = true;
      console.log('✅ New connection created successfully');
    } catch (error) {
      console.error('❌ Error creating new connection:', error.message);
      throw error;
    }
  }
  
  if (!isInit) {
    // Remove old listeners
    const events = [
      'messages.upsert', 'messages.update', 'group-participants.update',
      'groups.update', 'message.delete', 'presence.update',
      'connection.update', 'creds.update'
    ];
    
    events.forEach(event => {
      try {
        global.conn.ev.off(event);
      } catch (error) {
        // Ignore errors for events that might not have listeners
      }
    });
  }

  // Default messages
  const messageTemplates = {
    welcome: `Hello @user!\n\n🎉 *WELCOME* to the group @group!\n\n📜 Please read the *DESCRIPTION* @desc.`,
    bye: `👋 GOODBYE @user \n\nSee you later!`,
    spromote: `*@user* has been promoted to an admin!`,
    sdemote: `*@user* is no longer an admin.`,
    sDesc: `The group description has been updated to:\n@desc`,
    sSubject: `The group title has been changed to:\n@group`,
    sIcon: `The group icon has been updated!`,
    sRevoke: `The group link has been changed to:\n@revoke`,
    sAnnounceOn: `The group is now *CLOSED*!\nOnly admins can send messages.`,
    sAnnounceOff: `The group is now *OPEN*!\nAll participants can send messages.`,
    sRestrictOn: `Edit Group Info has been restricted to admins only!`,
    sRestrictOff: `Edit Group Info is now available to all participants!`
  };

  Object.assign(global.conn, messageTemplates);

  // Bind handlers
  try {
    global.conn.handler = handler.handler?.bind(global.conn) || (() => {});
    global.conn.pollUpdate = handler.pollUpdate?.bind(global.conn) || (() => {});
    global.conn.participantsUpdate = handler.participantsUpdate?.bind(global.conn) || (() => {});
    global.conn.groupsUpdate = handler.groupsUpdate?.bind(global.conn) || (() => {});
    global.conn.onDelete = handler.deleteUpdate?.bind(global.conn) || (() => {});
    global.conn.presenceUpdate = handler.presenceUpdate?.bind(global.conn) || (() => {});
    global.conn.connectionUpdate = connectionUpdate.bind(global.conn);
    global.conn.credsUpdate = saveCreds.bind(global.conn, true);
  } catch (error) {
    console.error('❌ Error binding handlers:', error.message);
  }

  // Add event listeners
  try {
    global.conn.ev.on('messages.upsert', global.conn.handler);
    global.conn.ev.on('messages.update', global.conn.pollUpdate);
    global.conn.ev.on('group-participants.update', global.conn.participantsUpdate);
    global.conn.ev.on('groups.update', global.conn.groupsUpdate);
    global.conn.ev.on('message.delete', global.conn.onDelete);
    global.conn.ev.on('presence.update', global.conn.presenceUpdate);
    global.conn.ev.on('connection.update', global.conn.connectionUpdate);
    global.conn.ev.on('creds.update', global.conn.credsUpdate);
  } catch (error) {
    console.error('❌ Error adding event listeners:', error.message);
  }
  
  isInit = false;
  return true;
};

// Plugin loading
const pluginFolder = global.__dirname(join(__dirname, './plugins/index'));
const pluginFilter = filename => /\.js$/.test(filename);
global.plugins = {};

async function filesInit() {
  try {
    if (!existsSync(pluginFolder)) {
      console.error('❌ Plugin folder not found:', pluginFolder);
      return;
    }
    
    const files = readdirSync(pluginFolder).filter(pluginFilter);
    console.log(`📦 Found ${files.length} plugins to load`);
    
    for (const filename of files) {
      try {
        const file = global.__filename(join(pluginFolder, filename));
        const module = await import(file);
        global.plugins[filename] = module.default || module;
      } catch (e) {
        console.error(`❌ Error loading plugin ${filename}:`, e.message);
        delete global.plugins[filename];
      }
    }
  } catch (error) {
    console.error('❌ Error reading plugin directory:', error.message);
  }
}

await filesInit();
console.log(`✅ Loaded ${Object.keys(global.plugins).length} plugins`);

global.reload = async (_ev, filename) => {
  if (pluginFilter(filename)) {
    const dir = global.__filename(join(pluginFolder, filename), true);
    
    if (filename in global.plugins) {
      if (existsSync(dir)) {
        console.log(`🔄 Updated plugin - '${filename}'`);
      } else {
        console.log(`🗑️ Deleted plugin - '${filename}'`);
        return delete global.plugins[filename];
      }
    } else {
      console.log(`🆕 New plugin - '${filename}'`);
    }
    
    try {
      const err = syntaxerror(readFileSync(dir), filename, {
        sourceType: 'module',
        allowAwaitOutsideFunction: true,
      });
      
      if (err) {
        console.error(`❌ Syntax error in '${filename}':`, format(err));
        return;
      }
      
      const module = await import(`${global.__filename(dir)}?update=${Date.now()}`);
      global.plugins[filename] = module.default || module;
      
      global.plugins = Object.fromEntries(
        Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
      );
    } catch (e) {
      console.error(`❌ Error loading plugin '${filename}':`, format(e));
    }
  }
};

Object.freeze(global.reload);

// Watch for plugin changes
try {
  if (existsSync(pluginFolder)) {
    watch(pluginFolder, global.reload);
    console.log('👀 Watching for plugin changes');
  }
} catch (error) {
  console.error('❌ Error setting up plugin watcher:', error.message);
}

// Initialize connection
try {
  await createConnection();
  await global.reloadHandler();
  console.log('✅ Bot initialization completed successfully!');
} catch (error) {
  console.error('❌ Failed to initialize bot:', error.message);
  process.exit(1);
}

// Quick test for dependencies
async function _quickTest() {
  try {
    const test = await Promise.all(
      [
        spawn('ffmpeg', ['-version']),
        spawn('ffprobe', ['-version']),
        spawn('node', ['--version']),
      ].map(p => {
        return Promise.race([
          new Promise(resolve => {
            p.on('close', code => {
              resolve(code === 0);
            });
          }),
          new Promise(resolve => {
            p.on('error', _ => resolve(false));
          }),
        ]);
      })
    );
    
    const [ffmpeg, ffprobe, node] = test;
    global.support = { ffmpeg, ffprobe, node };
    Object.freeze(global.support);
    
    console.log('✅ Dependency check completed');
  } catch (error) {
    console.error('❌ Dependency check failed:', error.message);
  }
}

// Session cleanup function
async function cleanupSessions() {
  if (global.stopped === 'close' || !global.conn || !global.conn.user) return;
  clearsession();
  console.log('🧹 Session files cleaned up');
}

// Run session cleanup every 30 minutes
setInterval(cleanupSessions, 1800000);

// Run quick test
_quickTest().catch(console.error);

// Export for external use
export { globalConn as conn };
