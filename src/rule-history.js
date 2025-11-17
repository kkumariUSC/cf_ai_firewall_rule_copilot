export class RuleHistoryDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      this.rules = await this.state.storage.get("rules") || [];
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    // -------------------------
    // GET /history  → return all rules
    // -------------------------
    if (url.pathname.endsWith("/history") && method === "GET") {
      return new Response(JSON.stringify(this.rules), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // -------------------------
    // POST /add  → add rule
    // -------------------------
    if (url.pathname.endsWith("/add") && method === "POST") {
      const rule = await request.json();

      this.rules.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...rule
      });

      await this.state.storage.put("rules", this.rules);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // -------------------------
    // POST /clear → delete all rules
    // -------------------------
    if (url.pathname.replace(/\/$/, "") === "/clear" && method === "POST") {
      this.rules = [];
      await this.state.storage.put("rules", this.rules);

      return new Response(JSON.stringify({ cleared: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // -------------------------
    // DELETE /delete/:id
    // -------------------------
    if (url.pathname.includes("/delete/") && method === "DELETE") {
      const id = url.pathname.split("/").pop();

      this.rules = this.rules.filter(r => r.id !== id);
      await this.state.storage.put("rules", this.rules);

      return new Response(JSON.stringify({ deleted: id }));
    }

    // -------------------------
    // GET /get/:id
    // -------------------------
    if (url.pathname.includes("/get/") && method === "GET") {
      const id = url.pathname.split("/").pop();
      const rule = this.rules.find(r => r.id === id);

      if (!rule) return new Response("Not found", { status: 404 });

      return new Response(JSON.stringify(rule), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Not found", { status: 404 });
  }
}
