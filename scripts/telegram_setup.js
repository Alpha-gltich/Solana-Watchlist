const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN is missing. Add it to .env and run from the repo root: " +
      "node --env-file=.env scripts/telegram_setup.js"
  );
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// The token sits in the request URL, so scrub it from any error text.
function scrub(value) {
  return String(value).split(TOKEN).join("[TOKEN]");
}

function describeError(err) {
  const cause = err && err.cause;
  const code = cause && (cause.code || cause.name);
  return scrub((err && err.message) || err) + (code ? ` [cause: ${scrub(code)}]` : "");
}

async function call(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`${method} failed: ${res.status} ${json.description || ""}`);
  }
  return json.result;
}

async function main() {
  const updates = await call("getUpdates");
  const chats = new Map();
  for (const update of updates) {
    const chat = update.message && update.message.chat;
    if (chat) chats.set(chat.id, chat.type);
  }
  if (chats.size === 0) {
    throw new Error(
      "No messages found. Open your bot in Telegram, press Start, send it 'hi', then run this again."
    );
  }
  for (const [id, type] of chats) {
    console.log(`Chat found: id=${id} type=${type}`);
  }
  const [firstId] = chats.keys();
  await call("sendMessage", {
    chat_id: firstId,
    text: "Aegis test message: Telegram delivery works.",
  });
  console.log(`Test message sent. Add this line to .env:`);
  console.log(`TELEGRAM_CHAT_ID=${firstId}`);
}

main().catch((err) => {
  console.error("Telegram setup failed:", describeError(err));
  process.exit(1);
});