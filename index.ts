import { $ } from "bun";

const PORT = process.env.PORT || 3000;
const WOL_PASSWORD = process.env.WOL_PASSWORD;
const MAC_ADDRESS = process.env.MAC_ADDRESS;
const TARGET_IP = process.env.TARGET_IP;

if (!WOL_PASSWORD || !MAC_ADDRESS || !TARGET_IP) {
  console.error("❌ Erreur : Variables manquantes dans le .env");
  process.exit(1);
}

// 🛡️ SYSTÈME DE LOGS INTERNES
const logsHistory: string[] = [];
function shieldLog(message: string) {
  const timestamp = new Date().toLocaleTimeString('fr-FR');
  const formatted = `[${timestamp}] ${message}`;
  console.log(formatted); // Garde la trace dans PM2
  logsHistory.push(formatted);
  if (logsHistory.length > 15) logsHistory.shift(); // Garde seulement les 15 derniers
}

shieldLog("DÉMARRAGE DU SYSTÈME CENTRAL.");

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Vérification Haute Sécurité
    const authHeader = req.headers.get("authorization");
    const expectedAuth = `Bearer ${WOL_PASSWORD}`;

    if (!authHeader || authHeader !== expectedAuth) {
      const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "Inconnue";
      shieldLog(`⚠️ ALERTE : Tentative d'intrusion bloquée (IP: ${ip})`);
      return new Response(
        JSON.stringify({ error: "ACCÈS REFUSÉ" }), 
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // NOUVELLE ROUTE : LOGS
    if (url.pathname === "/logs" && req.method === "GET") {
      return new Response(
        JSON.stringify({ success: true, logs: logsHistory.join("\n") }), 
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Route WAKE
    if (url.pathname === "/wake" && req.method === "GET") {
      try {
        shieldLog("INITIATION PROTOCOLE RÉVEIL (MAGIC PACKET)");
        await $`npx ts-wol@latest ${MAC_ADDRESS}`.quiet();
        return new Response(
          JSON.stringify({ success: true, message: "PROTOCOLE DE RÉVEIL INITIALISÉ." }), 
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        shieldLog("❌ ERREUR LORS DE L'ENVOI DU PAQUET");
        return new Response(JSON.stringify({ error: "ERREUR RÉSEAU" }), { status: 500 });
      }
    }

    // Route STATUS
    if (url.pathname === "/status" && req.method === "GET") {
      try {
        const { exitCode } = await $`ping -c 1 -W 1 ${TARGET_IP}`.quiet().nothrow();
        // On ne loggue pas les pings réussis pour ne pas spammer la console, sauf si c'est important
        return new Response(
          JSON.stringify({ online: exitCode === 0, ip: TARGET_IP }), 
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        return new Response(JSON.stringify({ error: "ERREUR PING" }), { status: 500 });
      }
    }

    // ROUTE SHUTDOWN 
    if (url.pathname === "/shutdown" && req.method === "GET") {
      try {
        shieldLog("INITIATION PROTOCOLE D'EXTINCTION...");
        // On lance la commande sudo shutdown sans mdp grâce à visudo
        await $`ssh ton_user_ubuntu@${TARGET_IP} "sudo /sbin/shutdown -h now"`.quiet();

        return new Response(
          JSON.stringify({ success: true, message: "COMMANDE D'EXTINCTION ENVOYÉE." }), 
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        shieldLog("❌ ERREUR LORS DE L'EXTINCTION");
        return new Response(JSON.stringify({ error: "ÉCHEC DE LA LIAISON SSH" }), { status: 500 });
      }
    }

    // ROUTE RESTART 
    if (url.pathname === "/restart" && req.method === "GET") {
      try {
        shieldLog("INITIATION PROTOCOLE DE REDÉMARRAGE...");
        await $`ssh ton_user_ubuntu@${TARGET_IP} "sudo /sbin/reboot"`.quiet();

        return new Response(
          JSON.stringify({ success: true, message: "COMMANDE DE REDÉMARRAGE ENVOYÉE." }), 
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        shieldLog("❌ ERREUR LORS DU REDÉMARRAGE");
        return new Response(JSON.stringify({ error: "ÉCHEC DE LA LIAISON SSH" }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ error: "ROUTE INCONNUE" }), { status: 404 });
  },
});

console.log(`🚀 Serveur actif sur le port ${server.port}`);