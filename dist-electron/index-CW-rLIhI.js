import { c as u, s as B } from "./main-BJtS9lS9.js";
import T from "net";
import G from "tls";
import J from "assert";
import D from "http";
import R from "https";
import K from "url";
var w = {}, I = {}, h = {}, W = u && u.__createBinding || (Object.create ? function(e, n, t, o) {
  o === void 0 && (o = t);
  var i = Object.getOwnPropertyDescriptor(n, t);
  (!i || ("get" in i ? !n.__esModule : i.writable || i.configurable)) && (i = { enumerable: !0, get: function() {
    return n[t];
  } }), Object.defineProperty(e, o, i);
} : function(e, n, t, o) {
  o === void 0 && (o = t), e[o] = n[t];
}), Q = u && u.__setModuleDefault || (Object.create ? function(e, n) {
  Object.defineProperty(e, "default", { enumerable: !0, value: n });
} : function(e, n) {
  e.default = n;
}), L = u && u.__importStar || function(e) {
  if (e && e.__esModule) return e;
  var n = {};
  if (e != null) for (var t in e) t !== "default" && Object.prototype.hasOwnProperty.call(e, t) && W(n, e, t);
  return Q(n, e), n;
};
Object.defineProperty(h, "__esModule", { value: !0 });
h.req = h.json = h.toBuffer = void 0;
const V = L(D), X = L(R);
async function q(e) {
  let n = 0;
  const t = [];
  for await (const o of e)
    n += o.length, t.push(o);
  return Buffer.concat(t, n);
}
h.toBuffer = q;
async function Y(e) {
  const t = (await q(e)).toString("utf8");
  try {
    return JSON.parse(t);
  } catch (o) {
    const i = o;
    throw i.message += ` (input: ${t})`, i;
  }
}
h.json = Y;
function Z(e, n = {}) {
  const o = ((typeof e == "string" ? e : e.href).startsWith("https:") ? X : V).request(e, n), i = new Promise((l, d) => {
    o.once("response", l).once("error", d).end();
  });
  return o.then = i.then.bind(i), o;
}
h.req = Z;
(function(e) {
  var n = u && u.__createBinding || (Object.create ? function(c, r, s, a) {
    a === void 0 && (a = s);
    var f = Object.getOwnPropertyDescriptor(r, s);
    (!f || ("get" in f ? !r.__esModule : f.writable || f.configurable)) && (f = { enumerable: !0, get: function() {
      return r[s];
    } }), Object.defineProperty(c, a, f);
  } : function(c, r, s, a) {
    a === void 0 && (a = s), c[a] = r[s];
  }), t = u && u.__setModuleDefault || (Object.create ? function(c, r) {
    Object.defineProperty(c, "default", { enumerable: !0, value: r });
  } : function(c, r) {
    c.default = r;
  }), o = u && u.__importStar || function(c) {
    if (c && c.__esModule) return c;
    var r = {};
    if (c != null) for (var s in c) s !== "default" && Object.prototype.hasOwnProperty.call(c, s) && n(r, c, s);
    return t(r, c), r;
  }, i = u && u.__exportStar || function(c, r) {
    for (var s in c) s !== "default" && !Object.prototype.hasOwnProperty.call(r, s) && n(r, c, s);
  };
  Object.defineProperty(e, "__esModule", { value: !0 }), e.Agent = void 0;
  const l = o(T), d = o(D), _ = R;
  i(h, e);
  const p = Symbol("AgentBaseInternalState");
  class y extends d.Agent {
    constructor(r) {
      super(r), this[p] = {};
    }
    /**
     * Determine whether this is an `http` or `https` request.
     */
    isSecureEndpoint(r) {
      if (r) {
        if (typeof r.secureEndpoint == "boolean")
          return r.secureEndpoint;
        if (typeof r.protocol == "string")
          return r.protocol === "https:";
      }
      const { stack: s } = new Error();
      return typeof s != "string" ? !1 : s.split(`
`).some((a) => a.indexOf("(https.js:") !== -1 || a.indexOf("node:https:") !== -1);
    }
    // In order to support async signatures in `connect()` and Node's native
    // connection pooling in `http.Agent`, the array of sockets for each origin
    // has to be updated synchronously. This is so the length of the array is
    // accurate when `addRequest()` is next called. We achieve this by creating a
    // fake socket and adding it to `sockets[origin]` and incrementing
    // `totalSocketCount`.
    incrementSockets(r) {
      if (this.maxSockets === 1 / 0 && this.maxTotalSockets === 1 / 0)
        return null;
      this.sockets[r] || (this.sockets[r] = []);
      const s = new l.Socket({ writable: !1 });
      return this.sockets[r].push(s), this.totalSocketCount++, s;
    }
    decrementSockets(r, s) {
      if (!this.sockets[r] || s === null)
        return;
      const a = this.sockets[r], f = a.indexOf(s);
      f !== -1 && (a.splice(f, 1), this.totalSocketCount--, a.length === 0 && delete this.sockets[r]);
    }
    // In order to properly update the socket pool, we need to call `getName()` on
    // the core `https.Agent` if it is a secureEndpoint.
    getName(r) {
      return this.isSecureEndpoint(r) ? _.Agent.prototype.getName.call(this, r) : super.getName(r);
    }
    createSocket(r, s, a) {
      const f = {
        ...s,
        secureEndpoint: this.isSecureEndpoint(s)
      }, v = this.getName(f), x = this.incrementSockets(v);
      Promise.resolve().then(() => this.connect(r, f)).then((g) => {
        if (this.decrementSockets(v, x), g instanceof d.Agent)
          try {
            return g.addRequest(r, f);
          } catch (b) {
            return a(b);
          }
        this[p].currentSocket = g, super.createSocket(r, s, a);
      }, (g) => {
        this.decrementSockets(v, x), a(g);
      });
    }
    createConnection() {
      const r = this[p].currentSocket;
      if (this[p].currentSocket = void 0, !r)
        throw new Error("No socket was returned in the `connect()` function");
      return r;
    }
    get defaultPort() {
      return this[p].defaultPort ?? (this.protocol === "https:" ? 443 : 80);
    }
    set defaultPort(r) {
      this[p] && (this[p].defaultPort = r);
    }
    get protocol() {
      return this[p].protocol ?? (this.isSecureEndpoint() ? "https:" : "http:");
    }
    set protocol(r) {
      this[p] && (this[p].protocol = r);
    }
  }
  e.Agent = y;
})(I);
var j = {}, ee = u && u.__importDefault || function(e) {
  return e && e.__esModule ? e : { default: e };
};
Object.defineProperty(j, "__esModule", { value: !0 });
j.parseProxyResponse = void 0;
const te = ee(B), m = (0, te.default)("https-proxy-agent:parse-proxy-response");
function re(e) {
  return new Promise((n, t) => {
    let o = 0;
    const i = [];
    function l() {
      const c = e.read();
      c ? y(c) : e.once("readable", l);
    }
    function d() {
      e.removeListener("end", _), e.removeListener("error", p), e.removeListener("readable", l);
    }
    function _() {
      d(), m("onend"), t(new Error("Proxy connection ended before receiving CONNECT response"));
    }
    function p(c) {
      d(), m("onerror %o", c), t(c);
    }
    function y(c) {
      i.push(c), o += c.length;
      const r = Buffer.concat(i, o), s = r.indexOf(`\r
\r
`);
      if (s === -1) {
        m("have not received end of HTTP headers yet..."), l();
        return;
      }
      const a = r.slice(0, s).toString("ascii").split(`\r
`), f = a.shift();
      if (!f)
        return e.destroy(), t(new Error("No header received from proxy CONNECT response"));
      const v = f.split(" "), x = +v[1], g = v.slice(2).join(" "), b = {};
      for (const O of a) {
        if (!O)
          continue;
        const C = O.indexOf(":");
        if (C === -1)
          return e.destroy(), t(new Error(`Invalid header from proxy CONNECT response: "${O}"`));
        const E = O.slice(0, C).toLowerCase(), A = O.slice(C + 1).trimStart(), S = b[E];
        typeof S == "string" ? b[E] = [S, A] : Array.isArray(S) ? S.push(A) : b[E] = A;
      }
      m("got proxy server response: %o %o", f, b), d(), n({
        connect: {
          statusCode: x,
          statusText: g,
          headers: b
        },
        buffered: r
      });
    }
    e.on("error", p), e.on("end", _), l();
  });
}
j.parseProxyResponse = re;
var ne = u && u.__createBinding || (Object.create ? function(e, n, t, o) {
  o === void 0 && (o = t);
  var i = Object.getOwnPropertyDescriptor(n, t);
  (!i || ("get" in i ? !n.__esModule : i.writable || i.configurable)) && (i = { enumerable: !0, get: function() {
    return n[t];
  } }), Object.defineProperty(e, o, i);
} : function(e, n, t, o) {
  o === void 0 && (o = t), e[o] = n[t];
}), oe = u && u.__setModuleDefault || (Object.create ? function(e, n) {
  Object.defineProperty(e, "default", { enumerable: !0, value: n });
} : function(e, n) {
  e.default = n;
}), k = u && u.__importStar || function(e) {
  if (e && e.__esModule) return e;
  var n = {};
  if (e != null) for (var t in e) t !== "default" && Object.prototype.hasOwnProperty.call(e, t) && ne(n, e, t);
  return oe(n, e), n;
}, U = u && u.__importDefault || function(e) {
  return e && e.__esModule ? e : { default: e };
};
Object.defineProperty(w, "__esModule", { value: !0 });
var z = w.HttpsProxyAgent = void 0;
const $ = k(T), N = k(G), se = U(J), ie = U(B), ce = I, ue = K, ae = j, P = (0, ie.default)("https-proxy-agent"), M = (e) => e.servername === void 0 && e.host && !$.isIP(e.host) ? {
  ...e,
  servername: e.host
} : e;
class F extends ce.Agent {
  constructor(n, t) {
    super(t), this.options = { path: void 0 }, this.proxy = typeof n == "string" ? new ue.URL(n) : n, this.proxyHeaders = (t == null ? void 0 : t.headers) ?? {}, P("Creating new HttpsProxyAgent instance: %o", this.proxy.href);
    const o = (this.proxy.hostname || this.proxy.host).replace(/^\[|\]$/g, ""), i = this.proxy.port ? parseInt(this.proxy.port, 10) : this.proxy.protocol === "https:" ? 443 : 80;
    this.connectOpts = {
      // Attempt to negotiate http/1.1 for proxy servers that support http/2
      ALPNProtocols: ["http/1.1"],
      ...t ? H(t, "headers") : null,
      host: o,
      port: i
    };
  }
  /**
   * Called when the node-core HTTP client library is creating a
   * new HTTP request.
   */
  async connect(n, t) {
    const { proxy: o } = this;
    if (!t.host)
      throw new TypeError('No "host" provided');
    let i;
    o.protocol === "https:" ? (P("Creating `tls.Socket`: %o", this.connectOpts), i = N.connect(M(this.connectOpts))) : (P("Creating `net.Socket`: %o", this.connectOpts), i = $.connect(this.connectOpts));
    const l = typeof this.proxyHeaders == "function" ? this.proxyHeaders() : { ...this.proxyHeaders }, d = $.isIPv6(t.host) ? `[${t.host}]` : t.host;
    let _ = `CONNECT ${d}:${t.port} HTTP/1.1\r
`;
    if (o.username || o.password) {
      const s = `${decodeURIComponent(o.username)}:${decodeURIComponent(o.password)}`;
      l["Proxy-Authorization"] = `Basic ${Buffer.from(s).toString("base64")}`;
    }
    l.Host = `${d}:${t.port}`, l["Proxy-Connection"] || (l["Proxy-Connection"] = this.keepAlive ? "Keep-Alive" : "close");
    for (const s of Object.keys(l))
      _ += `${s}: ${l[s]}\r
`;
    const p = (0, ae.parseProxyResponse)(i);
    i.write(`${_}\r
`);
    const { connect: y, buffered: c } = await p;
    if (n.emit("proxyConnect", y), this.emit("proxyConnect", y, n), y.statusCode === 200)
      return n.once("socket", fe), t.secureEndpoint ? (P("Upgrading socket connection to TLS"), N.connect({
        ...H(M(t), "host", "path", "port"),
        socket: i
      })) : i;
    i.destroy();
    const r = new $.Socket({ writable: !1 });
    return r.readable = !0, n.once("socket", (s) => {
      P("Replaying proxy buffer for failed request"), (0, se.default)(s.listenerCount("data") > 0), s.push(c), s.push(null);
    }), r;
  }
}
F.protocols = ["http", "https"];
z = w.HttpsProxyAgent = F;
function fe(e) {
  e.resume();
}
function H(e, ...n) {
  const t = {};
  let o;
  for (o in e)
    n.includes(o) || (t[o] = e[o]);
  return t;
}
const be = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  get HttpsProxyAgent() {
    return z;
  },
  default: w
}, Symbol.toStringTag, { value: "Module" }));
export {
  be as i
};
