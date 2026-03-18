import { $ } from "bun";

const PORT = process.env.PORT;
const WOL_PASSWORD = process.env.WOL_PASSWORD;
const MAC_ADDRESS = process.env.MAC_ADDRESS;

if (!WOL_PASSWORD || !MAC_ADDRESS) {
  console.error("Erreur : WOL_PASSWORD et MAC_ADDRESS doivent être définis dans le fichier .env");
  process.exit(1);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === "/wake" && req.method === "GET") {
      const userPwd = url.searchParams.get("mdp");

      if (!userPwd || userPwd !== WOL_PASSWORD) {
        return new Response(
          JSON.stringify({ error: "Accès refusé : mot de passe invalide." }), 
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        await $`npx ts-wol@latest ${MAC_ADDRESS}`;
        
        console.log(`✅ Paquet WoL envoyé avec succès à ${MAC_ADDRESS}`);
        return new Response(
          JSON.stringify({ success: true, message: `Paquet magique envoyé avec succès à l'appareil ${MAC_ADDRESS}.` }), 
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

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Serveur WoL actif sur http://localhost:${server.port}`);