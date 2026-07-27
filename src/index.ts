import { createBot } from "./bot.js";

const bot = createBot();

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

bot.start({
  onStart: (info) => console.log(`Bot @${info.username} is running.`),
});
