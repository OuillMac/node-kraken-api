"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._hidePrivates = exports._CountTrigger = exports._request = exports._sendRequest = exports._prepareRequest = exports._BinaryReceiver = exports._UTF8Receiver = exports._Authenticator = exports.Kraken = exports._GENNONCE = exports._REST_VERSION = exports._WS_PRIV_HOSTNAME = exports._WS_PUB_HOSTNAME = exports._REST_HOSTNAME = exports._USER_AGENT = void 0;
const qs = __importStar(require("querystring"));
const https = __importStar(require("https"));
const crc_1 = require("crc");
const crypto_1 = __importDefault(require("crypto"));
const ws_1 = __importDefault(require("ws"));
exports._USER_AGENT = "node-kraken-api/1.0.0";
exports._REST_HOSTNAME = "api.kraken.com";
exports._WS_PUB_HOSTNAME = "ws.kraken.com";
exports._WS_PRIV_HOSTNAME = "ws-auth.kraken.com";
exports._REST_VERSION = "0";
exports._GENNONCE = (() => {
    let prev = -1;
    let next = -1;
    return Object.freeze(() => {
        next = Date.now();
        if (next <= prev)
            next = prev + 1;
        prev = next;
        return next;
    });
})();
class Kraken {
    constructor({ key, secret, genotp, gennonce = exports._GENNONCE, timeout = 1000, } = {}) {
        this.ws = new (class WS {
            constructor(kraken) {
                this.pub = new Kraken.WS.Connection(exports._WS_PUB_HOSTNAME, () => kraken.timeout);
                this.priv = new Kraken.WS.Connection(exports._WS_PRIV_HOSTNAME, () => kraken.timeout);
            }
            ticker() {
                return new Kraken.WS.Subscriber(this.pub, "ticker", (self, payload, status) => {
                    for (let i = 1; i < payload.length - 2; ++i)
                        self.emit("update", payload[i], status.pair);
                }, {});
            }
            ohlc(options) {
                return new Kraken.WS.Subscriber(this.pub, "ohlc", (self, payload, status) => {
                    for (let i = 1; i < payload.length - 2; ++i)
                        self.emit("update", payload[i], status.pair);
                }, options || {});
            }
            trade() {
                return new Kraken.WS.Subscriber(this.pub, "trade", (self, payload, status) => {
                    for (let i = 1; i < payload.length - 2; ++i)
                        self.emit("update", payload[i], status.pair);
                }, {});
            }
            spread() {
                return new Kraken.WS.Subscriber(this.pub, "spread", (self, payload, status) => {
                    for (let i = 1; i < payload.length - 2; ++i)
                        self.emit("update", payload[i], status.pair);
                }, {});
            }
            book(options) {
                const mirrors = {};
                const locks = {};
                function spawnResubscribe(sub, status) {
                    return __awaiter(this, void 0, void 0, function* () {
                        if (locks[status.pair])
                            return;
                        locks[status.pair] = true;
                        try {
                            delete mirrors[status.pair];
                            yield sub.unsubscribe(status.pair);
                            yield sub.subscribe(status.pair);
                        }
                        catch (e) {
                            if (e instanceof Error)
                                sub.emit("error", e, status);
                            else
                                sub.emit("error", new Kraken.UnknownError("received an unknown error", e), status);
                        }
                        delete locks[status.pair];
                    });
                }
                return new Kraken.WS.Subscriber(this.pub, "book", (self, payload, status) => __awaiter(this, void 0, void 0, function* () {
                    for (let i = 1; i < payload.length - 2; ++i) {
                        try {
                            if (payload[i].as && payload[i].bs) {
                                self.emit("snapshot", payload[i], status.pair);
                                mirrors[status.pair] = payload[i];
                            }
                            else {
                                if (payload[i].a)
                                    self.emit("ask", payload[i], status.pair);
                                if (payload[i].b)
                                    self.emit("bid", payload[i], status.pair);
                                if (mirrors[status.pair]) {
                                    const { modified, verified } = Kraken.WS.Book.applyUpdate(mirrors[status.pair], payload[i]);
                                    if (modified && verified) {
                                        self.emit("mirror", mirrors[status.pair], status.pair);
                                    }
                                    else if (!verified) {
                                        spawnResubscribe(self, status);
                                    }
                                }
                            }
                        }
                        catch (e) {
                            if (e instanceof Error)
                                self.emit("error", e, status);
                            else
                                self.emit("error", new Kraken.UnknownError("received an unknown error", e), status);
                        }
                    }
                }), options || {});
            }
            ownTrades(options) {
                return new Kraken.WS.Subscriber(this.priv, "ownTrades", (self, payload) => {
                    for (let i = 0; i < payload.length - 2; ++i)
                        self.emit("update", payload[i], payload[payload.length - 1].sequence);
                }, options);
            }
            openOrders(options) {
                return new Kraken.WS.Subscriber(this.priv, "openOrders", (self, payload) => {
                    for (let i = 0; i < payload.length - 2; ++i)
                        self.emit("update", payload[i], payload[payload.length - 1].sequence);
                }, options);
            }
            addOrder(options) {
                return this.priv.request(Object.assign(Object.assign({}, options), { event: "addOrder" }));
            }
            cancelOrder(options) {
                return this.priv.requestMulti(Object.assign(Object.assign({}, options), { event: "cancelOrder" }), options.txid.length);
            }
            cancelAll(options) {
                return this.priv.request(Object.assign(Object.assign({}, options), { event: "cancelAll" }));
            }
            cancelAllOrdersAfter(options) {
                return this.priv.request(Object.assign(Object.assign({}, options), { event: "cancelAllOrdersAfter" }));
            }
        })(this);
        if (key && !secret) {
            throw new Kraken.SettingsError("Key provided without secret");
        }
        if (!key && secret) {
            throw new Kraken.SettingsError("Secret provided without key");
        }
        if (genotp && !key && !secret) {
            throw new Kraken.SettingsError("OTPGen provided without key or secret");
        }
        if (timeout <= 0) {
            throw new Kraken.SettingsError("Timeout must be > 0");
        }
        this.timeout = timeout;
        this._gennonce = gennonce;
        this._auth = key && secret ? new _Authenticator(key, secret, genotp) : null;
        _hidePrivates(this);
    }
    request(endpoint, options = null, type = "public", encoding = "utf8") {
        return _request(endpoint, options, type, encoding, this.timeout, this._gennonce, this._auth);
    }
    time() {
        return this.request("Time");
    }
    systemStatus() {
        return this.request("SystemStatus");
    }
    assets(options) {
        return this.request("Assets", options);
    }
    assetPairs(options) {
        return this.request("AssetPairs", options);
    }
    ticker(options) {
        return this.request("Ticker", options);
    }
    ohlc(options) {
        return this.request("OHLC", options);
    }
    depth(options) {
        return this.request("Depth", options);
    }
    trades(options) {
        return this.request("Trades", options);
    }
    spread(options) {
        return this.request("Spread", options);
    }
    getWebSocketsToken() {
        return this.request("GetWebSocketsToken", null, "private");
    }
    balance() {
        return this.request("Balance", null, "private");
    }
    tradeBalance(options) {
        return this.request("TradeBalance", options, "private");
    }
    openOrders(options) {
        return this.request("OpenOrders", options, "private");
    }
    closedOrders(options) {
        return this.request("ClosedOrders", options, "private");
    }
    queryOrders(options) {
        return this.request("QueryOrders", options, "private");
    }
    tradesHistory(options) {
        return this.request("TradesHistory", options, "private");
    }
    queryTrades(options) {
        return this.request("QueryTrades", options, "private");
    }
    openPositions(options) {
        return this.request("OpenPositions", options, "private");
    }
    ledgers(options) {
        return this.request("Ledgers", options, "private");
    }
    queryLedgers(options) {
        return this.request("QueryLedgers", options, "private");
    }
    tradeVolume(options) {
        return this.request("TradeVolume", options, "private");
    }
    addExport(options) {
        return this.request("AddExport", options, "private");
    }
    exportStatus(options) {
        return this.request("ExportStatus", options, "private");
    }
    retrieveExport(options) {
        return this.request("RetrieveExport", options, "private", "binary");
    }
    removeExport(options) {
        return this.request("RemoveExport", options, "private");
    }
    addOrder(options) {
        return this.request("AddOrder", options, "private");
    }
    cancelOrder(options) {
        return this.request("CancelOrder", options, "private");
    }
    cancelAll() {
        return this.request("CancelAll", null, "private");
    }
    cancelAllOrdersAfter(options) {
        return this.request("CancelAllOrdersAfter", options, "private");
    }
    depositMethods(options) {
        return this.request("DepositMethods", options, "private");
    }
    depositAddresses(options) {
        return this.request("DepositAddresses", options, "private");
    }
    depositStatus(options) {
        return this.request("DepositStatus", options, "private");
    }
    withdrawInfo(options) {
        return this.request("WithdrawInfo", options, "private");
    }
    withdraw(options) {
        return this.request("Withdraw", options, "private");
    }
    withdrawStatus(options) {
        return this.request("WithdrawStatus", options, "private");
    }
    withdrawCancel(options) {
        return this.request("WithdrawCancel", options, "private");
    }
    walletTransfer(options) {
        return this.request("WalletTransfer", options, "private");
    }
    stake(options) {
        return this.request("Stake", options, "private");
    }
    unstake(options) {
        return this.request("Unstake", options, "private");
    }
    stakingAssets() {
        return this.request("Staking/Assets", null, "private");
    }
    stakingPending() {
        return this.request("Staking/Pending", null, "private");
    }
    stakingTransactions() {
        return this.request("Staking/Transactions", null, "private");
    }
}
exports.Kraken = Kraken;
(function (Kraken) {
    class InternalError extends Error {
        constructor(message) {
            super(message);
        }
    }
    Kraken.InternalError = InternalError;
    class UnknownError extends Error {
        constructor(message, info) {
            super(message);
            this.info = info;
        }
    }
    Kraken.UnknownError = UnknownError;
    class ArgumentError extends Error {
        constructor(message) {
            super(message);
        }
    }
    Kraken.ArgumentError = ArgumentError;
    class SettingsError extends ArgumentError {
        constructor(description) {
            super(description);
        }
    }
    Kraken.SettingsError = SettingsError;
    class JSONParseError extends Error {
        constructor(source, parseError) {
            super(parseError.message);
            this.source = source;
        }
    }
    Kraken.JSONParseError = JSONParseError;
    class BufferParseError extends Error {
        constructor(source, parseError) {
            super(parseError.message);
            this.source = source;
        }
    }
    Kraken.BufferParseError = BufferParseError;
    class HTTPRequestError extends Error {
        constructor(statusCode, statusMessage) {
            if (statusCode === undefined) {
                super("Expected an HTTP status code");
            }
            else {
                super(statusCode + ": " + statusMessage);
                this.statusCode = statusCode;
                this.statusMessage = statusMessage;
            }
        }
    }
    Kraken.HTTPRequestError = HTTPRequestError;
    class RESTAPIError extends Error {
        constructor(body) {
            super(JSON.stringify(body.error));
            this.body = body;
        }
    }
    Kraken.RESTAPIError = RESTAPIError;
    class TimeoutError extends Error {
        constructor(message) {
            super(message);
        }
    }
    Kraken.TimeoutError = TimeoutError;
    class WSAPIError extends Error {
        constructor(eventMessage) {
            super(eventMessage.errorMessage);
            this.eventMessage = eventMessage;
        }
    }
    Kraken.WSAPIError = WSAPIError;
    class Emitter {
        constructor() {
            this._evdata = {};
            this._running = false;
            this._opqueue = [];
            _hidePrivates(this);
        }
        on(event, listener, options) {
            const op = () => {
                const cbs = this._evdata[event];
                const opts = Object.assign({ once: false }, options);
                if (cbs)
                    cbs.set(listener, opts);
                else
                    this._evdata[event] = new Map([[listener, opts]]);
            };
            if (!this._running)
                op();
            else
                this._opqueue.push(op);
            return this;
        }
        once(ev, cbOrOptions, options) {
            if (typeof cbOrOptions === "function") {
                const op = () => {
                    const cbs = this._evdata[ev];
                    const opts = Object.assign({ once: true }, options);
                    if (cbs)
                        cbs.set(cbOrOptions, opts);
                    else
                        this._evdata[ev] = new Map([[cbOrOptions, opts]]);
                };
                if (!this._running)
                    op();
                else
                    this._opqueue.push(op);
                return this;
            }
            else {
                return new Promise((resolve) => {
                    const op = () => {
                        const cbs = this._evdata[ev];
                        const opts = Object.assign(Object.assign({ once: true }, cbOrOptions), { protect: true });
                        const shim = ((...data) => resolve(data));
                        if (cbs)
                            cbs.set(shim, opts);
                        else
                            this._evdata[ev] = new Map([[shim, opts]]);
                    };
                    if (!this._running)
                        op();
                    else
                        this._opqueue.push(op);
                });
            }
        }
        off(ev, cb) {
            const op = () => {
                if (ev !== undefined && cb !== undefined) {
                    const cbs = this._evdata[ev];
                    if (cbs) {
                        cbs.delete(cb);
                        if (cbs.size === 0)
                            delete this._evdata[ev];
                    }
                }
                else if (ev !== undefined) {
                    const cbs = this._evdata[ev];
                    if (cbs) {
                        const todel = [];
                        cbs.forEach(({ protect }, cb) => {
                            if (!protect)
                                todel.push(cb);
                        });
                        todel.forEach((cb) => cbs.delete(cb));
                        if (cbs.size === 0)
                            delete this._evdata[ev];
                    }
                }
                else {
                    Object.keys(this._evdata).forEach((ev) => this.off(ev));
                }
            };
            if (!this._running)
                op();
            else
                this._opqueue.push(op);
            return this;
        }
        emit(event, ...data) {
            var _a;
            this._running = true;
            (_a = this._evdata[event]) === null || _a === void 0 ? void 0 : _a.forEach(({ once, filter }, cb) => {
                if (filter ? filter(...data) : true) {
                    cb(...data);
                    if (once)
                        this.off(event, cb);
                }
            });
            if (this._opqueue.length) {
                this._opqueue.forEach((op) => op());
                this._opqueue = [];
            }
            this._running = false;
            return this;
        }
    }
    Kraken.Emitter = Emitter;
    let WS;
    (function (WS) {
        let Book;
        (function (Book) {
            function applyUpdate(snapshot, update) {
                const [snaphsotLevels, updateLevels, ascending] = (() => {
                    if (update.a) {
                        return [snapshot.as, update.a, true];
                    }
                    else {
                        return [snapshot.bs, update.b, false];
                    }
                })();
                let modified = false;
                const depth = snaphsotLevels.length;
                for (const u of updateLevels) {
                    const uPrice = +u[0];
                    const uTime = +u[2];
                    let matched = false;
                    for (let i = 0; i < snaphsotLevels.length; ++i) {
                        const lPrice = +snaphsotLevels[i][0];
                        if (ascending && uPrice > lPrice)
                            continue;
                        if (!ascending && uPrice < lPrice)
                            continue;
                        if (uPrice === lPrice) {
                            if (uTime > +snaphsotLevels[i][2]) {
                                if (+u[1] !== 0) {
                                    snaphsotLevels[i][1] = u[1];
                                    snaphsotLevels[i][2] = u[2];
                                }
                                else {
                                    snaphsotLevels.splice(i, 1);
                                }
                                modified = true;
                            }
                            matched = true;
                            break;
                        }
                        else {
                            snaphsotLevels.splice(i, 0, [u[0], u[1], u[2]]);
                            matched = true;
                            modified = true;
                            break;
                        }
                    }
                    if (!matched) {
                        snaphsotLevels.push([u[0], u[1], u[2]]);
                        modified = true;
                    }
                }
                for (let i = 0; i < snaphsotLevels.length - depth; ++i)
                    snaphsotLevels.pop();
                let verifystr = "";
                {
                    let i = 0;
                    for (const a of snapshot.as) {
                        verifystr += a[0].replace(".", "").replace(/^0*(.*)/m, "$1");
                        verifystr += a[1].replace(".", "").replace(/^0*(.*)/m, "$1");
                        if (++i >= 10)
                            break;
                    }
                }
                {
                    let i = 0;
                    for (const b of snapshot.bs) {
                        verifystr += b[0].replace(".", "").replace(/^0*(.*)/m, "$1");
                        verifystr += b[1].replace(".", "").replace(/^0*(.*)/m, "$1");
                        if (++i >= 10)
                            break;
                    }
                }
                return { modified, verified: update.c === "" + (0, crc_1.crc32)(verifystr) };
            }
            Book.applyUpdate = applyUpdate;
        })(Book = WS.Book || (WS.Book = {}));
        class Connection extends Emitter {
            constructor(hostname, gettimeout) {
                super();
                this._state = "closed";
                this._socket = null;
                this._sendQueue = [];
                this.hostname = hostname;
                this._gettimeout = gettimeout;
                this._setState("closed");
                _hidePrivates(this);
            }
            get state() {
                return this._state;
            }
            get socket() {
                return this._socket;
            }
            ping() {
                return __awaiter(this, void 0, void 0, function* () {
                    yield this.request({ event: "ping" });
                });
            }
            request(request) {
                return __awaiter(this, void 0, void 0, function* () {
                    return new Promise((resolve, reject) => {
                        const reqid = (0, exports._GENNONCE)();
                        let prevreqid = request.reqid;
                        this.once("dict", (o) => {
                            if (!o.errorMessage) {
                                if (prevreqid)
                                    o.reqid = prevreqid;
                                resolve(o);
                            }
                            else {
                                reject(new WSAPIError(o));
                            }
                        }, { protect: true, filter: (o) => o.reqid === reqid });
                        this.write(JSON.stringify(Object.assign(Object.assign({}, request), { reqid })));
                    });
                });
            }
            requestMulti(request, nResponses) {
                return __awaiter(this, void 0, void 0, function* () {
                    return new Promise((resolve) => {
                        const reqid = (0, exports._GENNONCE)();
                        let prevreqid = request.reqid;
                        const responses = [];
                        const resolver = new _CountTrigger(nResponses, () => {
                            this.off("dict", l);
                            resolve(responses);
                        });
                        const l = (o) => {
                            if (prevreqid)
                                o.reqid = prevreqid;
                            responses.push(o);
                            resolver.fireWhenReady();
                        };
                        this.on("dict", l, { protect: true, filter: (o) => o.reqid === reqid });
                        this.write(JSON.stringify(Object.assign(Object.assign({}, request), { reqid })));
                    });
                });
            }
            open() {
                return new Promise((resolve, reject) => {
                    if (this._state === "open" || this._state === "opening") {
                        reject();
                    }
                    else {
                        this._setState("opening");
                        this._socket = new ws_1.default("wss://" + this.hostname + ":443", {
                            timeout: this._gettimeout(),
                        });
                        this._socket.addListener("message", this._onread.bind(this));
                        this._socket.addListener("error", this._onerror.bind(this));
                        this._socket.addListener("close", this._onclose.bind(this));
                        this._socket.addListener("open", this._onopen.bind(this));
                        const onceOpen = () => {
                            if (!this._socket)
                                reject(new InternalError("Socket should have been available"));
                            else {
                                this._socket.removeListener("open", onceOpen);
                                resolve();
                            }
                        };
                        this._socket.addListener("open", onceOpen);
                    }
                });
            }
            close(code, reason) {
                return new Promise((resolve, reject) => {
                    if (this._state === "closed" || this._state === "closing")
                        reject();
                    else {
                        this._setState("closing");
                        if (this._socket) {
                            const onceClosed = () => {
                                if (!this._socket) {
                                    resolve();
                                }
                                else {
                                    reject(new InternalError("Socket should not have been available"));
                                }
                            };
                            this._socket.addListener("close", onceClosed);
                            this._socket.close(code, reason);
                        }
                        else {
                            reject(new InternalError("Socket should have been available"));
                        }
                    }
                });
            }
            terminate() {
                if (this._socket) {
                    this._socket.removeAllListeners();
                    this._socket.terminate();
                    this._socket = null;
                }
                this._setState("closed");
            }
            write(data) {
                if (this._socket && this._state === "open") {
                    this._socket.send(data);
                    this.emit("write", data);
                }
                else {
                    this.open();
                    this._sendQueue.push(data);
                }
                return this;
            }
            _setState(state) {
                if (this._state !== state) {
                    this._state = state;
                    this.emit("state", state);
                }
            }
            _parseRead(data) {
                try {
                    const parsed = JSON.parse(data);
                    this.emit("json", parsed);
                    if (parsed instanceof Array) {
                        this.emit("array", parsed);
                    }
                    else if (parsed instanceof Object) {
                        this.emit("dict", parsed);
                        if (parsed.event === "heartbeat") {
                            this.emit("heartbeat");
                        }
                        else if (parsed.event === "systemStatus") {
                            this.emit("systemStatus", parsed);
                        }
                    }
                }
                catch (_) { }
            }
            _onread(data) {
                this.emit("read", data);
                if (typeof data === "string") {
                    this._parseRead(data);
                }
                else if (data instanceof Buffer) {
                    this._parseRead(data.toString("utf8"));
                }
                else {
                    this.emit("error", new InternalError("Expected either a string or buffer WS response."));
                }
            }
            _onerror(err) {
                this.emit("error", err);
            }
            _onclose(code, message) {
                this.emit("close", code, message);
                this.terminate();
            }
            _onopen() {
                this.emit("open");
                if (this._state !== "open") {
                    this._setState("open");
                    if (this._socket) {
                        for (const data of this._sendQueue) {
                            this._socket.send(data);
                            this.emit("write", data);
                        }
                    }
                    else {
                        this.terminate();
                    }
                }
            }
        }
        WS.Connection = Connection;
        class Subscriber extends Emitter {
            constructor(con, name, payloadDistributor, options) {
                super();
                this._reqid = (0, exports._GENNONCE)();
                this.subscriptions = new Set();
                this._con = con;
                this.name = name;
                this.options = options;
                this.on("payload", (payload, status) => payloadDistributor(this, payload, status), {
                    protect: true,
                });
                _hidePrivates(this);
            }
            subscribe(pair, ...pairs) {
                return __awaiter(this, void 0, void 0, function* () {
                    return new Promise((resolve) => {
                        const request = {
                            event: "subscribe",
                            reqid: this._reqid,
                            subscription: Object.assign(Object.assign({}, this.options), { name: this.name }),
                        };
                        if (pair) {
                            request.pair = [pair, ...pairs];
                            const resolver = new _CountTrigger(request.pair.length, () => resolve(this));
                            request.pair.forEach((p) => this._mksub(p).then(() => resolver.fireWhenReady()));
                        }
                        else {
                            this._mksub().then(() => resolve(this));
                        }
                        this._con.write(JSON.stringify(request));
                    });
                });
            }
            unsubscribe(pair, ...pairs) {
                return __awaiter(this, void 0, void 0, function* () {
                    return new Promise((resolve) => {
                        const request = {
                            event: "unsubscribe",
                            reqid: this._reqid,
                            subscription: Object.assign(Object.assign({}, this.options), { name: this.name }),
                        };
                        if (pair) {
                            request.pair = [pair, ...pairs];
                            const resolver = new _CountTrigger(request.pair.length, () => resolve(this));
                            request.pair.forEach((p) => this._rmsub(p).then(() => resolver.fireWhenReady()));
                        }
                        else {
                            this._rmsub().then(() => resolve(this));
                        }
                        this._con.write(JSON.stringify(request));
                    });
                });
            }
            _mksub(pair) {
                return new Promise((resolve) => {
                    const protect = { protect: true };
                    const sub = new Subscription(this._con, this._reqid, pair);
                    const onstatus = (status) => this.emit("status", status);
                    const onerror = (error) => this.emit("error", error, sub.status);
                    const onpayload = (payload) => this.emit("payload", payload, sub.status);
                    sub
                        .once("created", () => {
                        this.subscriptions.add(sub);
                        resolve();
                    }, protect)
                        .once("destroyed", () => {
                        this.subscriptions.delete(sub);
                        sub.off("status", onstatus).off("error", onerror).off("payload", onpayload);
                    }, protect)
                        .on("status", onstatus, protect)
                        .on("error", onerror, protect)
                        .on("payload", onpayload, protect);
                });
            }
            _rmsub(pair) {
                return new Promise((resolve) => {
                    for (const sub of this.subscriptions)
                        if (sub.status.pair === pair)
                            sub.once("destroyed", () => resolve(), { protect: true });
                });
            }
        }
        WS.Subscriber = Subscriber;
        class Subscription extends Emitter {
            constructor(con, reqid, pair) {
                super();
                this._isstatus = (dict) => {
                    return (dict.event === "subscriptionStatus" &&
                        dict.reqid === this.status.reqid &&
                        dict.pair === this.status.pair);
                };
                this._onstatus = (status) => {
                    this.status = status;
                    this.emit("status", this.status);
                    if (this.status.errorMessage)
                        this.emit("error", new WSAPIError(this.status));
                    if (this.status.status === "unsubscribed")
                        this._destroy();
                };
                this._onpayload = (payload) => {
                    this.emit("payload", payload);
                };
                this._init = (status) => {
                    this.status = status;
                    this.emit("status", status);
                    if (this.status.errorMessage) {
                        this.emit("error", new WSAPIError(this.status));
                    }
                    else if (this.status.status === "subscribed") {
                        this.emit("created");
                        this._con.on("dict", this._onstatus, {
                            protect: true,
                            filter: this._isstatus,
                        });
                        this._con.on("array", this._onpayload, {
                            protect: true,
                            filter: (arr) => arr[arr.length - 2] === this.status.channelName &&
                                (this.status.pair ? arr[arr.length - 1] === this.status.pair : true),
                        });
                    }
                    else {
                        this.emit("error", new UnknownError('Expected either a "subscribed" status or an errorMessage'));
                    }
                };
                this._con = con;
                this.status = {
                    event: "subscriptionStatus",
                    reqid,
                    pair: pair,
                    status: "init",
                };
                this._con.once("dict", this._init, {
                    protect: true,
                    filter: this._isstatus,
                });
                _hidePrivates(this);
            }
            _destroy() {
                this._con.off("dict", this._onstatus);
                this._con.off("array", this._onpayload);
                this.emit("destroyed");
            }
        }
        WS.Subscription = Subscription;
    })(WS = Kraken.WS || (Kraken.WS = {}));
})(Kraken = exports.Kraken || (exports.Kraken = {}));
class _Authenticator {
    constructor(key, secret, genotp) {
        this.signedHeaders = (path, postdata, nonce) => {
            return {
                "User-Agent": exports._USER_AGENT,
                "API-Key": key,
                "API-Sign": crypto_1.default
                    .createHmac("sha512", Buffer.from(secret, "base64"))
                    .update(path)
                    .update(crypto_1.default
                    .createHash("sha256")
                    .update(nonce + postdata)
                    .digest())
                    .digest("base64"),
            };
        };
        if (genotp) {
            this.signedQuery = (input) => {
                const otp = genotp();
                return Object.assign(Object.assign({}, input), { otp });
            };
        }
        else {
            this.signedQuery = (input) => {
                return input;
            };
        }
    }
}
exports._Authenticator = _Authenticator;
class _UTF8Receiver {
    constructor(onjson, onerror) {
        this._finalized = false;
        this._chunked = "";
        this._onjson = (json) => {
            try {
                onjson(json);
            }
            catch (_) { }
            this._finalized = true;
        };
        this._onerror = (error) => {
            try {
                onerror(error);
            }
            catch (_) { }
            this._finalized = true;
        };
        _hidePrivates(this);
    }
    nextChunk(chunk, statusCode, statusMessage) {
        if (this._finalized)
            return;
        if (!this._verifyStatus(statusCode, statusMessage))
            return;
        this._chunked += chunk;
    }
    finalize(statusCode, statusMessage) {
        if (this._finalized)
            return;
        if (!this._verifyStatus(statusCode, statusMessage))
            return;
        this._finalized = true;
        try {
            const body = JSON.parse(this._chunked);
            if (body.error && body.error.length > 0) {
                this._onerror(new Kraken.RESTAPIError(body));
            }
            else {
                this._onjson(body);
            }
        }
        catch (err) {
            if (err instanceof Error)
                this._onerror(new Kraken.JSONParseError(this._chunked, err));
            else
                this._onerror(new Kraken.JSONParseError(this._chunked, new Kraken.UnknownError("received an unknown error", err)));
        }
    }
    _verifyStatus(statusCode, statusMessage) {
        if (statusCode === undefined || statusCode < 200 || statusCode >= 300) {
            this._finalized = true;
            this._onerror(new Kraken.HTTPRequestError(statusCode, statusMessage));
            return false;
        }
        return true;
    }
}
exports._UTF8Receiver = _UTF8Receiver;
class _BinaryReceiver {
    constructor(onbuffer, onerror) {
        this._finalized = false;
        this._chunks = [];
        this._onbuffer = (buffer) => {
            try {
                onbuffer(buffer);
            }
            catch (_) { }
            this._finalized = true;
        };
        this._onerror = (error) => {
            try {
                onerror(error);
            }
            catch (_) { }
            this._finalized = true;
        };
        _hidePrivates(this);
    }
    nextChunk(chunk, statusCode, statusMessage) {
        if (this._finalized)
            return;
        if (!this._verifyStatus(statusCode, statusMessage))
            return;
        try {
            this._chunks.push(Buffer.from(chunk, "binary"));
        }
        catch (e) {
            if (e instanceof Error)
                this._onerror(new Kraken.BufferParseError(chunk, e));
            else
                this._onerror(new Kraken.BufferParseError(chunk, new Kraken.UnknownError("received an unknown error", e)));
        }
    }
    finalize(statusCode, statusMessage) {
        if (this._finalized)
            return;
        if (!this._verifyStatus(statusCode, statusMessage))
            return;
        this._finalized = true;
        if (this._chunks.length <= 0) {
            this._onerror(new Kraken.InternalError("Connection closed before chunks were received"));
            return;
        }
        try {
            this._onbuffer(Buffer.concat(this._chunks));
        }
        catch (e) {
            if (e instanceof Error)
                this._onerror(new Kraken.UnknownError(e.message));
            else
                this._onerror(new Kraken.UnknownError("received an unknown error", e));
        }
    }
    _verifyStatus(statusCode, statusMessage) {
        if (statusCode === undefined || statusCode < 200 || statusCode >= 300) {
            this._finalized = true;
            this._onerror(new Kraken.HTTPRequestError(statusCode, statusMessage));
            return false;
        }
        return true;
    }
}
exports._BinaryReceiver = _BinaryReceiver;
function _prepareRequest(endpoint, options, type, gennonce, auth) {
    const hostname = exports._REST_HOSTNAME;
    const nonce = gennonce();
    if (type === "private") {
        if (auth === null) {
            throw new Kraken.SettingsError("Cannot make a private request without key and secret.");
        }
        const method = "POST";
        const path = `/${exports._REST_VERSION}/private/${endpoint}`;
        const postdata = options
            ? qs.stringify(auth.signedQuery(Object.assign(Object.assign({}, options), { nonce })))
            : qs.stringify(auth.signedQuery({ nonce }));
        const headers = auth.signedHeaders(path, postdata, nonce);
        return {
            requestOptions: {
                hostname,
                path,
                method,
                headers,
            },
            postdata,
        };
    }
    else {
        const path = `/${exports._REST_VERSION}/public/${endpoint}`;
        const headers = {
            "User-Agent": exports._USER_AGENT,
        };
        if (options) {
            const method = "POST";
            const postdata = qs.stringify(Object.assign(Object.assign({}, options), { nonce }));
            return {
                requestOptions: {
                    hostname,
                    path,
                    method,
                    headers,
                },
                postdata,
            };
        }
        else {
            const method = "GET";
            const postdata = null;
            return {
                requestOptions: {
                    hostname,
                    path,
                    method,
                    headers,
                },
                postdata,
            };
        }
    }
}
exports._prepareRequest = _prepareRequest;
function _sendRequest(requestOptions, postdata, encoding, timeout) {
    return new Promise((resolve, reject) => {
        let didRespond = false;
        const r = https
            .request(requestOptions, (res) => {
            didRespond = true;
            try {
                const handler = (() => {
                    if (encoding === "utf8") {
                        return new _UTF8Receiver(resolve, reject);
                    }
                    else if (encoding === "binary") {
                        return new _BinaryReceiver(resolve, reject);
                    }
                    else {
                        throw new Kraken.ArgumentError("Invalid Encoding: " + encoding);
                    }
                })();
                res.setEncoding(encoding);
                res.on("data", (chunk) => handler.nextChunk(chunk, res.statusCode, res.statusMessage));
                res.on("end", () => {
                    handler.finalize(res.statusCode, res.statusMessage);
                    res.removeAllListeners();
                });
            }
            catch (e) {
                reject(e);
            }
        })
            .on("error", (e) => {
            r.destroy();
            reject(e);
        })
            .setTimeout(timeout, () => {
            if (!didRespond) {
                r.destroy();
                reject(new Kraken.TimeoutError("REST request timed out."));
            }
        });
        if (postdata)
            r.write(postdata);
        r.end();
    });
}
exports._sendRequest = _sendRequest;
function _request(endpoint, options, type, encoding, timeout, gennonce, auth) {
    return __awaiter(this, void 0, void 0, function* () {
        const { requestOptions, postdata } = _prepareRequest(endpoint, options, type, gennonce, auth);
        if (encoding === "utf8") {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const data = yield _sendRequest(requestOptions, postdata, encoding, timeout);
                    if (data.error.length)
                        reject(new Kraken.RESTAPIError(data));
                    resolve(data.result);
                }
                catch (e) {
                    reject(e);
                }
            }));
        }
        else if (encoding === "binary") {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const data = yield _sendRequest(requestOptions, postdata, encoding, timeout);
                    resolve(data);
                }
                catch (e) {
                    reject(e);
                }
            }));
        }
        else {
            throw new Kraken.ArgumentError('encoding must be "utf8" or "binary"');
        }
    });
}
exports._request = _request;
class _CountTrigger {
    constructor(count, action) {
        if (count <= 0)
            throw new Kraken.ArgumentError("Invalid count, must be > 0");
        this._count = count;
        this._action = action;
        _hidePrivates(this);
    }
    fireWhenReady() {
        if (--this._count === 0)
            this._action();
        if (this._count < 0)
            throw new Kraken.ArgumentError("Too many calls to fireWhenReady");
    }
}
exports._CountTrigger = _CountTrigger;
function _hidePrivates(o) {
    for (const [prop, descr] of Object.entries(Object.getOwnPropertyDescriptors(o))) {
        if (prop[0] === "_")
            Object.defineProperty(o, prop, Object.assign(Object.assign({}, descr), { enumerable: false }));
    }
}
exports._hidePrivates = _hidePrivates;
