import { $ } from "bun";

const PORT = process.env.PORT;
const WOL_PASSWORD = process.env.WOL_PASSWORD;
const MAC_ADDRESS = process.env.MAC_ADDRESS;
const TARGET_IP = process.env.TARGET_IP;
const TARGET_USER = process.env.TARGET_USER;

if (!WOL_PASSWORD || !MAC_ADDRESS || !TARGET_IP) {
  console.error("Erreur : Variables manquantes dans le .env");
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
      shieldLog(`ALERTE : Tentative d'intrusion bloquée (IP: ${ip})`);
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
        shieldLog("ERREUR LORS DE L'ENVOI DU PAQUET");
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
      shieldLog("INITIATION PROTOCOLE D'EXTINCTION...");
      // Injection de TARGET_USER et TARGET_IP
      const result = await $`ssh -o StrictHostKeyChecking=no ${TARGET_USER}@${TARGET_IP} "sudo /sbin/shutdown -h now"`.nothrow().quiet();

      if (result.exitCode === 0) {
        shieldLog("COMMANDE D'EXTINCTION ACCEPTÉE.");
        return new Response(
          JSON.stringify({ success: true, message: "COMMANDE ENVOYÉE." }), 
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } else {
        const errorMsg = result.stderr.toString().trim() || "Erreur inconnue";
        shieldLog(`ÉCHEC SSH : ${errorMsg}`);
        return new Response(JSON.stringify({ error: "ÉCHEC SSH" }), { status: 500 });
      }
    }

    // ROUTE : RESTART
    if (url.pathname === "/restart" && req.method === "GET") {
      shieldLog("INITIATION PROTOCOLE DE REDÉMARRAGE...");
      const result = await $`ssh -o StrictHostKeyChecking=no ${TARGET_USER}@${TARGET_IP} "sudo /sbin/reboot"`.nothrow().quiet();

      if (result.exitCode === 0) {
        shieldLog("COMMANDE DE REDÉMARRAGE ACCEPTÉE.");
        return new Response(
          JSON.stringify({ success: true, message: "COMMANDE ENVOYÉE." }), 
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } else {
        const errorMsg = result.stderr.toString().trim() || "Erreur inconnue";
        shieldLog(`ÉCHEC SSH : ${errorMsg}`);
        return new Response(JSON.stringify({ error: "ÉCHEC SSH" }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ error: "ROUTE INCONNUE" }), { status: 404 });
  },
});

console.log(`Serveur actif sur le port ${server.port}`);