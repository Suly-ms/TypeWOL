import { $ } from "bun";

const PORT = process.env.PORT;
const WOL_PASSWORD = process.env.WOL_PASSWORD;
const MAC_ADDRESS = process.env.MAC_ADDRESS;
const TARGET_IP = process.env.TARGET_IP;

// Vérification stricte au démarrage
if (!WOL_PASSWORD || !MAC_ADDRESS || !TARGET_IP) {
  console.error("Erreur : WOL_PASSWORD, MAC_ADDRESS et TARGET_IP doivent être définis dans .env");
  process.exit(1);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    const authHeader = req.headers.get("authorization");

    if (!authHeader || authHeader !== `Bearer ${WOL_PASSWORD}`) {
      await Bun.sleep(2000); 
      return new Response(
        JSON.stringify({ error: "Accès refusé" }), 
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Route WAKE (Réveil)
    if (url.pathname === "/wake" && req.method === "GET") {
      try {
        await $`npx ts-wol@latest ${MAC_ADDRESS}`;
        console.log(`✅ Paquet WoL envoyé avec succès à ${MAC_ADDRESS}`);
        return new Response(
          JSON.stringify({ success: true, message: "Paquet magique envoyé." }), 
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error(`❌ Erreur WoL:`, error);
        return new Response(
          JSON.stringify({ error: "Erreur lors de l'envoi du paquet réseau." }), 
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 3. Route STATUS (Vérification)
    if (url.pathname === "/status" && req.method === "GET") {
      try {
        // Ping l'IP cible (-c 1 = 1 paquet, -W 1 = timeout 1 seconde)
        // .quiet() masque la sortie console, .nothrow() empêche Bun de crasher si le ping échoue
        const { exitCode } = await $`ping -c 1 -W 1 ${TARGET_IP}`.quiet().nothrow();
        
        // Si le code de sortie est 0, le ping a réussi (PC allumé)
        const isOnline = exitCode === 0;

        return new Response(
          JSON.stringify({ online: isOnline, ip: TARGET_IP }), 
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: "Erreur interne lors du ping." }), 
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Route par défaut (404)
    return new Response(JSON.stringify({ error: "Route introuvable" }), { status: 404 });
  },
});

console.log(`🚀 Serveur WoL actif sur http://localhost:${server.port}`);