/* Offline Ajv 2020 worker.
The MIT License (MIT)

Copyright (c) 2015-2021 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


fast-deep-equal
MIT License

Copyright (c) 2017 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

fast-uri
Copyright (c) 2011-2021, Gary Court until https://github.com/garycourt/uri-js/commit/a1acf730b4bba3f1097c9f52e7d9d3aba8cdcaae
Copyright (c) 2021-present The Fastify team <https://github.com/fastify/fastify#team>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * The names of any contributors may not be used to endorse or promote
      products derived from this software without specific prior written
      permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS AND CONTRIBUTORS BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

                                  *   *   *

The complete list of contributors can be found at:
- https://github.com/garycourt/uri-js/graphs/contributors
json-schema-traverse
MIT License

Copyright (c) 2017 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
function fieldReviewWorker() {
  (function () {
    var e = (e, t) => () => (
        t || (e((t = { exports: {} }).exports, t, t.exports), (e = null)),
        t.exports
      ),
      t = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.regexpCode =
            e.getEsmExportName =
            e.getProperty =
            e.safeStringify =
            e.stringify =
            e.strConcat =
            e.addCodeArg =
            e.str =
            e._ =
            e.nil =
            e._Code =
            e.Name =
            e.IDENTIFIER =
            e._CodeOrName =
              void 0));
        var t = class {};
        ((e._CodeOrName = t), (e.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i));
        var n = class extends t {
          constructor(t) {
            if ((super(), !e.IDENTIFIER.test(t)))
              throw Error(`CodeGen: name must be a valid identifier`);
            this.str = t;
          }
          toString() {
            return this.str;
          }
          emptyStr() {
            return !1;
          }
          get names() {
            return { [this.str]: 1 };
          }
        };
        e.Name = n;
        var r = class extends t {
          constructor(e) {
            (super(), (this._items = typeof e == `string` ? [e] : e));
          }
          toString() {
            return this.str;
          }
          emptyStr() {
            if (this._items.length > 1) return !1;
            let e = this._items[0];
            return e === `` || e === `""`;
          }
          get str() {
            return (this._str ??= this._items.reduce((e, t) => `${e}${t}`, ``));
          }
          get names() {
            return (this._names ??= this._items.reduce(
              (e, t) => (t instanceof n && (e[t.str] = (e[t.str] || 0) + 1), e),
              {},
            ));
          }
        };
        ((e._Code = r), (e.nil = new r(``)));
        function i(e, ...t) {
          let n = [e[0]],
            i = 0;
          for (; i < t.length;) (s(n, t[i]), n.push(e[++i]));
          return new r(n);
        }
        e._ = i;
        let a = new r(`+`);
        function o(e, ...t) {
          let n = [p(e[0])],
            i = 0;
          for (; i < t.length;) (n.push(a), s(n, t[i]), n.push(a, p(e[++i])));
          return (c(n), new r(n));
        }
        e.str = o;
        function s(e, t) {
          t instanceof r ? e.push(...t._items) : t instanceof n ? e.push(t) : e.push(d(t));
        }
        e.addCodeArg = s;
        function c(e) {
          let t = 1;
          for (; t < e.length - 1;) {
            if (e[t] === a) {
              let n = l(e[t - 1], e[t + 1]);
              if (n !== void 0) {
                e.splice(t - 1, 3, n);
                continue;
              }
              e[t++] = `+`;
            }
            t++;
          }
        }
        function l(e, t) {
          if (t === `""`) return e;
          if (e === `""`) return t;
          if (typeof e == `string`)
            return t instanceof n || e[e.length - 1] !== `"`
              ? void 0
              : typeof t == `string`
                ? t[0] === `"`
                  ? e.slice(0, -1) + t.slice(1)
                  : void 0
                : `${e.slice(0, -1)}${t}"`;
          if (typeof t == `string` && t[0] === `"` && !(e instanceof n))
            return `"${e}${t.slice(1)}`;
        }
        function u(e, t) {
          return t.emptyStr() ? e : e.emptyStr() ? t : o`${e}${t}`;
        }
        e.strConcat = u;
        function d(e) {
          return typeof e == `number` || typeof e == `boolean` || e === null
            ? e
            : p(Array.isArray(e) ? e.join(`,`) : e);
        }
        function f(e) {
          return new r(p(e));
        }
        e.stringify = f;
        function p(e) {
          return JSON.stringify(e)
            .replace(/\u2028/g, `\\u2028`)
            .replace(/\u2029/g, `\\u2029`);
        }
        e.safeStringify = p;
        function m(t) {
          return typeof t == `string` && e.IDENTIFIER.test(t) ? new r(`.${t}`) : i`[${t}]`;
        }
        e.getProperty = m;
        function h(t) {
          if (typeof t == `string` && e.IDENTIFIER.test(t)) return new r(`${t}`);
          throw Error(`CodeGen: invalid export name: ${t}, use explicit $id name mapping`);
        }
        e.getEsmExportName = h;
        function g(e) {
          return new r(e.toString());
        }
        e.regexpCode = g;
      }),
      n = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.ValueScope = e.ValueScopeName = e.Scope = e.varKinds = e.UsedValueState = void 0));
        let n = t();
        var r = class extends Error {
            constructor(e) {
              (super(`CodeGen: "code" for ${e} not defined`), (this.value = e.value));
            }
          },
          i;
        ((function (e) {
          ((e[(e.Started = 0)] = `Started`), (e[(e.Completed = 1)] = `Completed`));
        })(i || (e.UsedValueState = i = {})),
          (e.varKinds = {
            const: new n.Name(`const`),
            let: new n.Name(`let`),
            var: new n.Name(`var`),
          }));
        var a = class {
          constructor({ prefixes: e, parent: t } = {}) {
            ((this._names = {}), (this._prefixes = e), (this._parent = t));
          }
          toName(e) {
            return e instanceof n.Name ? e : this.name(e);
          }
          name(e) {
            return new n.Name(this._newName(e));
          }
          _newName(e) {
            let t = this._names[e] || this._nameGroup(e);
            return `${e}${t.index++}`;
          }
          _nameGroup(e) {
            if (this._parent?._prefixes?.has(e) || (this._prefixes && !this._prefixes.has(e)))
              throw Error(`CodeGen: prefix "${e}" is not allowed in this scope`);
            return (this._names[e] = { prefix: e, index: 0 });
          }
        };
        e.Scope = a;
        var o = class extends n.Name {
          constructor(e, t) {
            (super(t), (this.prefix = e));
          }
          setValue(e, { property: t, itemIndex: r }) {
            ((this.value = e), (this.scopePath = (0, n._)`.${new n.Name(t)}[${r}]`));
          }
        };
        e.ValueScopeName = o;
        let s = (0, n._)`\n`;
        e.ValueScope = class extends a {
          constructor(e) {
            (super(e),
              (this._values = {}),
              (this._scope = e.scope),
              (this.opts = { ...e, _n: e.lines ? s : n.nil }));
          }
          get() {
            return this._scope;
          }
          name(e) {
            return new o(e, this._newName(e));
          }
          value(e, t) {
            if (t.ref === void 0) throw Error(`CodeGen: ref must be passed in value`);
            let n = this.toName(e),
              { prefix: r } = n,
              i = t.key ?? t.ref,
              a = this._values[r];
            if (a) {
              let e = a.get(i);
              if (e) return e;
            } else a = this._values[r] = /* @__PURE__ */ new Map();
            a.set(i, n);
            let o = this._scope[r] || (this._scope[r] = []),
              s = o.length;
            return ((o[s] = t.ref), n.setValue(t, { property: r, itemIndex: s }), n);
          }
          getValue(e, t) {
            let n = this._values[e];
            if (n) return n.get(t);
          }
          scopeRefs(e, t = this._values) {
            return this._reduceValues(t, (t) => {
              if (t.scopePath === void 0) throw Error(`CodeGen: name "${t}" has no value`);
              return (0, n._)`${e}${t.scopePath}`;
            });
          }
          scopeCode(e = this._values, t, n) {
            return this._reduceValues(
              e,
              (e) => {
                if (e.value === void 0) throw Error(`CodeGen: name "${e}" has no value`);
                return e.value.code;
              },
              t,
              n,
            );
          }
          _reduceValues(t, a, o = {}, s) {
            let c = n.nil;
            for (let l in t) {
              let u = t[l];
              if (!u) continue;
              let d = (o[l] = o[l] || /* @__PURE__ */ new Map());
              u.forEach((t) => {
                if (d.has(t)) return;
                d.set(t, i.Started);
                let o = a(t);
                if (o) {
                  let r = this.opts.es5 ? e.varKinds.var : e.varKinds.const;
                  c = (0, n._)`${c}${r} ${t} = ${o};${this.opts._n}`;
                } else if ((o = s?.(t))) c = (0, n._)`${c}${o}${this.opts._n}`;
                else throw new r(t);
                d.set(t, i.Completed);
              });
            }
            return c;
          }
        };
      }),
      r = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.or =
            e.and =
            e.not =
            e.CodeGen =
            e.operators =
            e.varKinds =
            e.ValueScopeName =
            e.ValueScope =
            e.Scope =
            e.Name =
            e.regexpCode =
            e.stringify =
            e.getProperty =
            e.nil =
            e.strConcat =
            e.str =
            e._ =
              void 0));
        let r = t(),
          i = n();
        var a = t();
        (Object.defineProperty(e, '_', {
          enumerable: !0,
          get: function () {
            return a._;
          },
        }),
          Object.defineProperty(e, 'str', {
            enumerable: !0,
            get: function () {
              return a.str;
            },
          }),
          Object.defineProperty(e, 'strConcat', {
            enumerable: !0,
            get: function () {
              return a.strConcat;
            },
          }),
          Object.defineProperty(e, 'nil', {
            enumerable: !0,
            get: function () {
              return a.nil;
            },
          }),
          Object.defineProperty(e, 'getProperty', {
            enumerable: !0,
            get: function () {
              return a.getProperty;
            },
          }),
          Object.defineProperty(e, 'stringify', {
            enumerable: !0,
            get: function () {
              return a.stringify;
            },
          }),
          Object.defineProperty(e, 'regexpCode', {
            enumerable: !0,
            get: function () {
              return a.regexpCode;
            },
          }),
          Object.defineProperty(e, 'Name', {
            enumerable: !0,
            get: function () {
              return a.Name;
            },
          }));
        var o = n();
        (Object.defineProperty(e, 'Scope', {
          enumerable: !0,
          get: function () {
            return o.Scope;
          },
        }),
          Object.defineProperty(e, 'ValueScope', {
            enumerable: !0,
            get: function () {
              return o.ValueScope;
            },
          }),
          Object.defineProperty(e, 'ValueScopeName', {
            enumerable: !0,
            get: function () {
              return o.ValueScopeName;
            },
          }),
          Object.defineProperty(e, 'varKinds', {
            enumerable: !0,
            get: function () {
              return o.varKinds;
            },
          }),
          (e.operators = {
            GT: new r._Code(`>`),
            GTE: new r._Code(`>=`),
            LT: new r._Code(`<`),
            LTE: new r._Code(`<=`),
            EQ: new r._Code(`===`),
            NEQ: new r._Code(`!==`),
            NOT: new r._Code(`!`),
            OR: new r._Code(`||`),
            AND: new r._Code(`&&`),
            ADD: new r._Code(`+`),
          }));
        var s = class {
            optimizeNodes() {
              return this;
            }
            optimizeNames(e, t) {
              return this;
            }
          },
          c = class extends s {
            constructor(e, t, n) {
              (super(), (this.varKind = e), (this.name = t), (this.rhs = n));
            }
            render({ es5: e, _n: t }) {
              let n = e ? i.varKinds.var : this.varKind,
                r = this.rhs === void 0 ? `` : ` = ${this.rhs}`;
              return `${n} ${this.name}${r};` + t;
            }
            optimizeNames(e, t) {
              if (e[this.name.str]) return ((this.rhs &&= j(this.rhs, e, t)), this);
            }
            get names() {
              return this.rhs instanceof r._CodeOrName ? this.rhs.names : {};
            }
          },
          l = class extends s {
            constructor(e, t, n) {
              (super(), (this.lhs = e), (this.rhs = t), (this.sideEffects = n));
            }
            render({ _n: e }) {
              return `${this.lhs} = ${this.rhs};` + e;
            }
            optimizeNames(e, t) {
              if (!(this.lhs instanceof r.Name && !e[this.lhs.str] && !this.sideEffects))
                return ((this.rhs = j(this.rhs, e, t)), this);
            }
            get names() {
              return A(this.lhs instanceof r.Name ? {} : { ...this.lhs.names }, this.rhs);
            }
          },
          u = class extends l {
            constructor(e, t, n, r) {
              (super(e, n, r), (this.op = t));
            }
            render({ _n: e }) {
              return `${this.lhs} ${this.op}= ${this.rhs};` + e;
            }
          },
          d = class extends s {
            constructor(e) {
              (super(), (this.label = e), (this.names = {}));
            }
            render({ _n: e }) {
              return `${this.label}:` + e;
            }
          },
          f = class extends s {
            constructor(e) {
              (super(), (this.label = e), (this.names = {}));
            }
            render({ _n: e }) {
              return `break${this.label ? ` ${this.label}` : ``};` + e;
            }
          },
          p = class extends s {
            constructor(e) {
              (super(), (this.error = e));
            }
            render({ _n: e }) {
              return `throw ${this.error};` + e;
            }
            get names() {
              return this.error.names;
            }
          },
          m = class extends s {
            constructor(e) {
              (super(), (this.code = e));
            }
            render({ _n: e }) {
              return `${this.code};` + e;
            }
            optimizeNodes() {
              return `${this.code}` ? this : void 0;
            }
            optimizeNames(e, t) {
              return ((this.code = j(this.code, e, t)), this);
            }
            get names() {
              return this.code instanceof r._CodeOrName ? this.code.names : {};
            }
          },
          h = class extends s {
            constructor(e = []) {
              (super(), (this.nodes = e));
            }
            render(e) {
              return this.nodes.reduce((t, n) => t + n.render(e), ``);
            }
            optimizeNodes() {
              let { nodes: e } = this,
                t = e.length;
              for (; t--;) {
                let n = e[t].optimizeNodes();
                Array.isArray(n) ? e.splice(t, 1, ...n) : n ? (e[t] = n) : e.splice(t, 1);
              }
              return e.length > 0 ? this : void 0;
            }
            optimizeNames(e, t) {
              let { nodes: n } = this,
                r = n.length;
              for (; r--;) {
                let i = n[r];
                i.optimizeNames(e, t) || (M(e, i.names), n.splice(r, 1));
              }
              return n.length > 0 ? this : void 0;
            }
            get names() {
              return this.nodes.reduce((e, t) => k(e, t.names), {});
            }
          },
          g = class extends h {
            render(e) {
              return `{` + e._n + super.render(e) + `}` + e._n;
            }
          },
          _ = class extends h {},
          v = class extends g {};
        v.kind = `else`;
        var y = class e extends g {
          constructor(e, t) {
            (super(t), (this.condition = e));
          }
          render(e) {
            let t = `if(${this.condition})` + super.render(e);
            return (this.else && (t += `else ` + this.else.render(e)), t);
          }
          optimizeNodes() {
            super.optimizeNodes();
            let t = this.condition;
            if (t === !0) return this.nodes;
            let n = this.else;
            if (n) {
              let e = n.optimizeNodes();
              n = this.else = Array.isArray(e) ? new v(e) : e;
            }
            if (n)
              return t === !1
                ? n instanceof e
                  ? n
                  : n.nodes
                : this.nodes.length
                  ? this
                  : new e(N(t), n instanceof e ? [n] : n.nodes);
            if (t !== !1 && this.nodes.length) return this;
          }
          optimizeNames(e, t) {
            if (
              ((this.else = this.else?.optimizeNames(e, t)), super.optimizeNames(e, t) || this.else)
            )
              return ((this.condition = j(this.condition, e, t)), this);
          }
          get names() {
            let e = super.names;
            return (A(e, this.condition), this.else && k(e, this.else.names), e);
          }
        };
        y.kind = `if`;
        var b = class extends g {};
        b.kind = `for`;
        var x = class extends b {
            constructor(e) {
              (super(), (this.iteration = e));
            }
            render(e) {
              return `for(${this.iteration})` + super.render(e);
            }
            optimizeNames(e, t) {
              if (super.optimizeNames(e, t))
                return ((this.iteration = j(this.iteration, e, t)), this);
            }
            get names() {
              return k(super.names, this.iteration.names);
            }
          },
          S = class extends b {
            constructor(e, t, n, r) {
              (super(), (this.varKind = e), (this.name = t), (this.from = n), (this.to = r));
            }
            render(e) {
              let t = e.es5 ? i.varKinds.var : this.varKind,
                { name: n, from: r, to: a } = this;
              return `for(${t} ${n}=${r}; ${n}<${a}; ${n}++)` + super.render(e);
            }
            get names() {
              return A(A(super.names, this.from), this.to);
            }
          },
          C = class extends b {
            constructor(e, t, n, r) {
              (super(), (this.loop = e), (this.varKind = t), (this.name = n), (this.iterable = r));
            }
            render(e) {
              return (
                `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(e)
              );
            }
            optimizeNames(e, t) {
              if (super.optimizeNames(e, t))
                return ((this.iterable = j(this.iterable, e, t)), this);
            }
            get names() {
              return k(super.names, this.iterable.names);
            }
          },
          w = class extends g {
            constructor(e, t, n) {
              (super(), (this.name = e), (this.args = t), (this.async = n));
            }
            render(e) {
              return (
                `${this.async ? `async ` : ``}function ${this.name}(${this.args})` + super.render(e)
              );
            }
          };
        w.kind = `func`;
        var T = class extends h {
          render(e) {
            return `return ` + super.render(e);
          }
        };
        T.kind = `return`;
        var E = class extends g {
            render(e) {
              let t = `try` + super.render(e);
              return (
                this.catch && (t += this.catch.render(e)),
                this.finally && (t += this.finally.render(e)),
                t
              );
            }
            optimizeNodes() {
              var e, t;
              return (
                super.optimizeNodes(),
                (e = this.catch) == null || e.optimizeNodes(),
                (t = this.finally) == null || t.optimizeNodes(),
                this
              );
            }
            optimizeNames(e, t) {
              var n, r;
              return (
                super.optimizeNames(e, t),
                (n = this.catch) == null || n.optimizeNames(e, t),
                (r = this.finally) == null || r.optimizeNames(e, t),
                this
              );
            }
            get names() {
              let e = super.names;
              return (
                this.catch && k(e, this.catch.names),
                this.finally && k(e, this.finally.names),
                e
              );
            }
          },
          D = class extends g {
            constructor(e) {
              (super(), (this.error = e));
            }
            render(e) {
              return `catch(${this.error})` + super.render(e);
            }
          };
        D.kind = `catch`;
        var O = class extends g {
          render(e) {
            return `finally` + super.render(e);
          }
        };
        ((O.kind = `finally`),
          (e.CodeGen = class {
            constructor(e, t = {}) {
              ((this._values = {}),
                (this._blockStarts = []),
                (this._constants = {}),
                (this.opts = {
                  ...t,
                  _n: t.lines
                    ? `
`
                    : ``,
                }),
                (this._extScope = e),
                (this._scope = new i.Scope({ parent: e })),
                (this._nodes = [new _()]));
            }
            toString() {
              return this._root.render(this.opts);
            }
            name(e) {
              return this._scope.name(e);
            }
            scopeName(e) {
              return this._extScope.name(e);
            }
            scopeValue(e, t) {
              let n = this._extScope.value(e, t);
              return (
                (
                  this._values[n.prefix] || (this._values[n.prefix] = /* @__PURE__ */ new Set())
                ).add(n),
                n
              );
            }
            getScopeValue(e, t) {
              return this._extScope.getValue(e, t);
            }
            scopeRefs(e) {
              return this._extScope.scopeRefs(e, this._values);
            }
            scopeCode() {
              return this._extScope.scopeCode(this._values);
            }
            _def(e, t, n, r) {
              let i = this._scope.toName(t);
              return (
                n !== void 0 && r && (this._constants[i.str] = n),
                this._leafNode(new c(e, i, n)),
                i
              );
            }
            const(e, t, n) {
              return this._def(i.varKinds.const, e, t, n);
            }
            let(e, t, n) {
              return this._def(i.varKinds.let, e, t, n);
            }
            var(e, t, n) {
              return this._def(i.varKinds.var, e, t, n);
            }
            assign(e, t, n) {
              return this._leafNode(new l(e, t, n));
            }
            add(t, n) {
              return this._leafNode(new u(t, e.operators.ADD, n));
            }
            code(e) {
              return (typeof e == `function` ? e() : e !== r.nil && this._leafNode(new m(e)), this);
            }
            object(...e) {
              let t = [`{`];
              for (let [n, i] of e)
                (t.length > 1 && t.push(`,`),
                  t.push(n),
                  (n !== i || this.opts.es5) && (t.push(`:`), (0, r.addCodeArg)(t, i)));
              return (t.push(`}`), new r._Code(t));
            }
            if(e, t, n) {
              if ((this._blockNode(new y(e)), t && n)) this.code(t).else().code(n).endIf();
              else if (t) this.code(t).endIf();
              else if (n) throw Error(`CodeGen: "else" body without "then" body`);
              return this;
            }
            elseIf(e) {
              return this._elseNode(new y(e));
            }
            else() {
              return this._elseNode(new v());
            }
            endIf() {
              return this._endBlockNode(y, v);
            }
            _for(e, t) {
              return (this._blockNode(e), t && this.code(t).endFor(), this);
            }
            for(e, t) {
              return this._for(new x(e), t);
            }
            forRange(e, t, n, r, a = this.opts.es5 ? i.varKinds.var : i.varKinds.let) {
              let o = this._scope.toName(e);
              return this._for(new S(a, o, t, n), () => r(o));
            }
            forOf(e, t, n, a = i.varKinds.const) {
              let o = this._scope.toName(e);
              if (this.opts.es5) {
                let e = t instanceof r.Name ? t : this.var(`_arr`, t);
                return this.forRange(`_i`, 0, (0, r._)`${e}.length`, (t) => {
                  (this.var(o, (0, r._)`${e}[${t}]`), n(o));
                });
              }
              return this._for(new C(`of`, a, o, t), () => n(o));
            }
            forIn(e, t, n, a = this.opts.es5 ? i.varKinds.var : i.varKinds.const) {
              if (this.opts.ownProperties) return this.forOf(e, (0, r._)`Object.keys(${t})`, n);
              let o = this._scope.toName(e);
              return this._for(new C(`in`, a, o, t), () => n(o));
            }
            endFor() {
              return this._endBlockNode(b);
            }
            label(e) {
              return this._leafNode(new d(e));
            }
            break(e) {
              return this._leafNode(new f(e));
            }
            return(e) {
              let t = new T();
              if ((this._blockNode(t), this.code(e), t.nodes.length !== 1))
                throw Error(`CodeGen: "return" should have one node`);
              return this._endBlockNode(T);
            }
            try(e, t, n) {
              if (!t && !n) throw Error(`CodeGen: "try" without "catch" and "finally"`);
              let r = new E();
              if ((this._blockNode(r), this.code(e), t)) {
                let e = this.name(`e`);
                ((this._currNode = r.catch = new D(e)), t(e));
              }
              return (
                n && ((this._currNode = r.finally = new O()), this.code(n)),
                this._endBlockNode(D, O)
              );
            }
            throw(e) {
              return this._leafNode(new p(e));
            }
            block(e, t) {
              return (
                this._blockStarts.push(this._nodes.length),
                e && this.code(e).endBlock(t),
                this
              );
            }
            endBlock(e) {
              let t = this._blockStarts.pop();
              if (t === void 0) throw Error(`CodeGen: not in self-balancing block`);
              let n = this._nodes.length - t;
              if (n < 0 || (e !== void 0 && n !== e))
                throw Error(`CodeGen: wrong number of nodes: ${n} vs ${e} expected`);
              return ((this._nodes.length = t), this);
            }
            func(e, t = r.nil, n, i) {
              return (this._blockNode(new w(e, t, n)), i && this.code(i).endFunc(), this);
            }
            endFunc() {
              return this._endBlockNode(w);
            }
            optimize(e = 1) {
              for (; e-- > 0;)
                (this._root.optimizeNodes(),
                  this._root.optimizeNames(this._root.names, this._constants));
            }
            _leafNode(e) {
              return (this._currNode.nodes.push(e), this);
            }
            _blockNode(e) {
              (this._currNode.nodes.push(e), this._nodes.push(e));
            }
            _endBlockNode(e, t) {
              let n = this._currNode;
              if (n instanceof e || (t && n instanceof t)) return (this._nodes.pop(), this);
              throw Error(`CodeGen: not in block "${t ? `${e.kind}/${t.kind}` : e.kind}"`);
            }
            _elseNode(e) {
              let t = this._currNode;
              if (!(t instanceof y)) throw Error(`CodeGen: "else" without "if"`);
              return ((this._currNode = t.else = e), this);
            }
            get _root() {
              return this._nodes[0];
            }
            get _currNode() {
              let e = this._nodes;
              return e[e.length - 1];
            }
            set _currNode(e) {
              let t = this._nodes;
              t[t.length - 1] = e;
            }
          }));
        function k(e, t) {
          for (let n in t) e[n] = (e[n] || 0) + (t[n] || 0);
          return e;
        }
        function A(e, t) {
          return t instanceof r._CodeOrName ? k(e, t.names) : e;
        }
        function j(e, t, n) {
          return e instanceof r.Name
            ? i(e)
            : a(e)
              ? new r._Code(
                  e._items.reduce(
                    (e, t) => (
                      t instanceof r.Name && (t = i(t)),
                      t instanceof r._Code ? e.push(...t._items) : e.push(t),
                      e
                    ),
                    [],
                  ),
                )
              : e;
          function i(e) {
            let r = n[e.str];
            return r === void 0 || t[e.str] !== 1 ? e : (delete t[e.str], r);
          }
          function a(e) {
            return (
              e instanceof r._Code &&
              e._items.some((e) => e instanceof r.Name && t[e.str] === 1 && n[e.str] !== void 0)
            );
          }
        }
        function M(e, t) {
          for (let n in t) e[n] = (e[n] || 0) - (t[n] || 0);
        }
        function N(e) {
          return typeof e == `boolean` || typeof e == `number` || e === null
            ? !e
            : (0, r._)`!${z(e)}`;
        }
        e.not = N;
        let P = R(e.operators.AND);
        function F(...e) {
          return e.reduce(P);
        }
        e.and = F;
        let I = R(e.operators.OR);
        function L(...e) {
          return e.reduce(I);
        }
        e.or = L;
        function R(e) {
          return (t, n) => (t === r.nil ? n : n === r.nil ? t : (0, r._)`${z(t)} ${e} ${z(n)}`);
        }
        function z(e) {
          return e instanceof r.Name ? e : (0, r._)`(${e})`;
        }
      }),
      i = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.checkStrictMode =
            e.getErrorPath =
            e.Type =
            e.useFunc =
            e.setEvaluated =
            e.evaluatedPropsToName =
            e.mergeEvaluated =
            e.eachItem =
            e.unescapeJsonPointer =
            e.escapeJsonPointer =
            e.escapeFragment =
            e.unescapeFragment =
            e.schemaRefOrVal =
            e.schemaHasRulesButRef =
            e.schemaHasRules =
            e.checkUnknownRules =
            e.alwaysValidSchema =
            e.toHash =
              void 0));
        let n = r(),
          i = t();
        function a(e) {
          let t = {};
          for (let n of e) t[n] = !0;
          return t;
        }
        e.toHash = a;
        function o(e, t) {
          return typeof t == `boolean`
            ? t
            : Object.keys(t).length === 0 || (s(e, t), !c(t, e.self.RULES.all));
        }
        e.alwaysValidSchema = o;
        function s(e, t = e.schema) {
          let { opts: n, self: r } = e;
          if (!n.strictSchema || typeof t == `boolean`) return;
          let i = r.RULES.keywords;
          for (let n in t) i[n] || C(e, `unknown keyword: "${n}"`);
        }
        e.checkUnknownRules = s;
        function c(e, t) {
          if (typeof e == `boolean`) return !e;
          for (let n in e) if (t[n]) return !0;
          return !1;
        }
        e.schemaHasRules = c;
        function l(e, t) {
          if (typeof e == `boolean`) return !e;
          for (let n in e) if (n !== `$ref` && t.all[n]) return !0;
          return !1;
        }
        e.schemaHasRulesButRef = l;
        function u({ topSchemaRef: e, schemaPath: t }, r, i, a) {
          if (!a) {
            if (typeof r == `number` || typeof r == `boolean`) return r;
            if (typeof r == `string`) return (0, n._)`${r}`;
          }
          return (0, n._)`${e}${t}${(0, n.getProperty)(i)}`;
        }
        e.schemaRefOrVal = u;
        function d(e) {
          return m(decodeURIComponent(e));
        }
        e.unescapeFragment = d;
        function f(e) {
          return encodeURIComponent(p(e));
        }
        e.escapeFragment = f;
        function p(e) {
          return typeof e == `number` ? `${e}` : e.replace(/~/g, `~0`).replace(/\//g, `~1`);
        }
        e.escapeJsonPointer = p;
        function m(e) {
          return e.replace(/~1/g, `/`).replace(/~0/g, `~`);
        }
        e.unescapeJsonPointer = m;
        function h(e, t) {
          if (Array.isArray(e)) for (let n of e) t(n);
          else t(e);
        }
        e.eachItem = h;
        function g({ mergeNames: e, mergeToName: t, mergeValues: r, resultToName: i }) {
          return (a, o, s, c) => {
            let l =
              s === void 0
                ? o
                : s instanceof n.Name
                  ? (o instanceof n.Name ? e(a, o, s) : t(a, o, s), s)
                  : o instanceof n.Name
                    ? (t(a, s, o), o)
                    : r(o, s);
            return c === n.Name && !(l instanceof n.Name) ? i(a, l) : l;
          };
        }
        e.mergeEvaluated = {
          props: g({
            mergeNames: (e, t, r) =>
              e.if((0, n._)`${r} !== true && ${t} !== undefined`, () => {
                e.if(
                  (0, n._)`${t} === true`,
                  () => e.assign(r, !0),
                  () => e.assign(r, (0, n._)`${r} || {}`).code((0, n._)`Object.assign(${r}, ${t})`),
                );
              }),
            mergeToName: (e, t, r) =>
              e.if((0, n._)`${r} !== true`, () => {
                t === !0 ? e.assign(r, !0) : (e.assign(r, (0, n._)`${r} || {}`), v(e, r, t));
              }),
            mergeValues: (e, t) => e === !0 || { ...e, ...t },
            resultToName: _,
          }),
          items: g({
            mergeNames: (e, t, r) =>
              e.if((0, n._)`${r} !== true && ${t} !== undefined`, () =>
                e.assign(r, (0, n._)`${t} === true ? true : ${r} > ${t} ? ${r} : ${t}`),
              ),
            mergeToName: (e, t, r) =>
              e.if((0, n._)`${r} !== true`, () =>
                e.assign(r, t === !0 || (0, n._)`${r} > ${t} ? ${r} : ${t}`),
              ),
            mergeValues: (e, t) => e === !0 || Math.max(e, t),
            resultToName: (e, t) => e.var(`items`, t),
          }),
        };
        function _(e, t) {
          if (t === !0) return e.var(`props`, !0);
          let r = e.var(`props`, (0, n._)`{}`);
          return (t !== void 0 && v(e, r, t), r);
        }
        e.evaluatedPropsToName = _;
        function v(e, t, r) {
          Object.keys(r).forEach((r) => e.assign((0, n._)`${t}${(0, n.getProperty)(r)}`, !0));
        }
        e.setEvaluated = v;
        let y = {};
        function b(e, t) {
          return e.scopeValue(`func`, {
            ref: t,
            code: y[t.code] || (y[t.code] = new i._Code(t.code)),
          });
        }
        e.useFunc = b;
        var x;
        (function (e) {
          ((e[(e.Num = 0)] = `Num`), (e[(e.Str = 1)] = `Str`));
        })(x || (e.Type = x = {}));
        function S(e, t, r) {
          if (e instanceof n.Name) {
            let i = t === x.Num;
            return r
              ? i
                ? (0, n._)`"[" + ${e} + "]"`
                : (0, n._)`"['" + ${e} + "']"`
              : i
                ? (0, n._)`"/" + ${e}`
                : (0, n._)`"/" + ${e}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
          }
          return r ? (0, n.getProperty)(e).toString() : `/` + p(e);
        }
        e.getErrorPath = S;
        function C(e, t, n = e.opts.strictSchema) {
          if (n) {
            if (((t = `strict mode: ${t}`), n === !0)) throw Error(t);
            e.self.logger.warn(t);
          }
        }
        e.checkStrictMode = C;
      }),
      a = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r();
        e.default = {
          data: new t.Name(`data`),
          valCxt: new t.Name(`valCxt`),
          instancePath: new t.Name(`instancePath`),
          parentData: new t.Name(`parentData`),
          parentDataProperty: new t.Name(`parentDataProperty`),
          rootData: new t.Name(`rootData`),
          dynamicAnchors: new t.Name(`dynamicAnchors`),
          vErrors: new t.Name(`vErrors`),
          errors: new t.Name(`errors`),
          this: new t.Name(`this`),
          self: new t.Name(`self`),
          scope: new t.Name(`scope`),
          json: new t.Name(`json`),
          jsonPos: new t.Name(`jsonPos`),
          jsonLen: new t.Name(`jsonLen`),
          jsonPart: new t.Name(`jsonPart`),
        };
      }),
      o = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.extendErrors =
            e.resetErrorsCount =
            e.reportExtraError =
            e.reportError =
            e.keyword$DataError =
            e.keywordError =
              void 0));
        let t = r(),
          n = i(),
          o = a();
        ((e.keywordError = {
          message: ({ keyword: e }) => (0, t.str)`must pass "${e}" keyword validation`,
        }),
          (e.keyword$DataError = {
            message: ({ keyword: e, schemaType: n }) =>
              n
                ? (0, t.str)`"${e}" keyword must be ${n} ($data)`
                : (0, t.str)`"${e}" keyword is invalid ($data)`,
          }));
        function s(n, r = e.keywordError, i, a) {
          let { it: o } = n,
            { gen: s, compositeRule: c, allErrors: l } = o,
            u = m(n, r, i);
          (a ?? (c || l)) ? d(s, u) : f(o, (0, t._)`[${u}]`);
        }
        e.reportError = s;
        function c(t, n = e.keywordError, r) {
          let { it: i } = t,
            { gen: a, compositeRule: s, allErrors: c } = i;
          (d(a, m(t, n, r)), s || c || f(i, o.default.vErrors));
        }
        e.reportExtraError = c;
        function l(e, n) {
          (e.assign(o.default.errors, n),
            e.if((0, t._)`${o.default.vErrors} !== null`, () =>
              e.if(
                n,
                () => e.assign((0, t._)`${o.default.vErrors}.length`, n),
                () => e.assign(o.default.vErrors, null),
              ),
            ));
        }
        e.resetErrorsCount = l;
        function u({ gen: e, keyword: n, schemaValue: r, data: i, errsCount: a, it: s }) {
          /* istanbul ignore if */
          if (a === void 0) throw Error(`ajv implementation error`);
          let c = e.name(`err`);
          e.forRange(`i`, a, o.default.errors, (a) => {
            (e.const(c, (0, t._)`${o.default.vErrors}[${a}]`),
              e.if((0, t._)`${c}.instancePath === undefined`, () =>
                e.assign(
                  (0, t._)`${c}.instancePath`,
                  (0, t.strConcat)(o.default.instancePath, s.errorPath),
                ),
              ),
              e.assign((0, t._)`${c}.schemaPath`, (0, t.str)`${s.errSchemaPath}/${n}`),
              s.opts.verbose &&
                (e.assign((0, t._)`${c}.schema`, r), e.assign((0, t._)`${c}.data`, i)));
          });
        }
        e.extendErrors = u;
        function d(e, n) {
          let r = e.const(`err`, n);
          (e.if(
            (0, t._)`${o.default.vErrors} === null`,
            () => e.assign(o.default.vErrors, (0, t._)`[${r}]`),
            (0, t._)`${o.default.vErrors}.push(${r})`,
          ),
            e.code((0, t._)`${o.default.errors}++`));
        }
        function f(e, n) {
          let { gen: r, validateName: i, schemaEnv: a } = e;
          a.$async
            ? r.throw((0, t._)`new ${e.ValidationError}(${n})`)
            : (r.assign((0, t._)`${i}.errors`, n), r.return(!1));
        }
        let p = {
          keyword: new t.Name(`keyword`),
          schemaPath: new t.Name(`schemaPath`),
          params: new t.Name(`params`),
          propertyName: new t.Name(`propertyName`),
          message: new t.Name(`message`),
          schema: new t.Name(`schema`),
          parentSchema: new t.Name(`parentSchema`),
        };
        function m(e, n, r) {
          let { createErrors: i } = e.it;
          return i === !1 ? (0, t._)`{}` : h(e, n, r);
        }
        function h(e, t, n = {}) {
          let { gen: r, it: i } = e,
            a = [g(i, n), _(e, n)];
          return (v(e, t, a), r.object(...a));
        }
        function g({ errorPath: e }, { instancePath: r }) {
          let i = r ? (0, t.str)`${e}${(0, n.getErrorPath)(r, n.Type.Str)}` : e;
          return [o.default.instancePath, (0, t.strConcat)(o.default.instancePath, i)];
        }
        function _({ keyword: e, it: { errSchemaPath: r } }, { schemaPath: i, parentSchema: a }) {
          let o = a ? r : (0, t.str)`${r}/${e}`;
          return (
            i && (o = (0, t.str)`${o}${(0, n.getErrorPath)(i, n.Type.Str)}`),
            [p.schemaPath, o]
          );
        }
        function v(e, { params: n, message: r }, i) {
          let { keyword: a, data: s, schemaValue: c, it: l } = e,
            { opts: u, propertyName: d, topSchemaRef: f, schemaPath: m } = l;
          (i.push([p.keyword, a], [p.params, typeof n == `function` ? n(e) : n || (0, t._)`{}`]),
            u.messages && i.push([p.message, typeof r == `function` ? r(e) : r]),
            u.verbose &&
              i.push([p.schema, c], [p.parentSchema, (0, t._)`${f}${m}`], [o.default.data, s]),
            d && i.push([p.propertyName, d]));
        }
      }),
      s = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.boolOrEmptySchema = e.topBoolOrEmptySchema = void 0));
        let t = o(),
          n = r(),
          i = a(),
          s = { message: `boolean schema is false` };
        function c(e) {
          let { gen: t, schema: r, validateName: a } = e;
          r === !1
            ? u(e, !1)
            : typeof r == `object` && r.$async === !0
              ? t.return(i.default.data)
              : (t.assign((0, n._)`${a}.errors`, null), t.return(!0));
        }
        e.topBoolOrEmptySchema = c;
        function l(e, t) {
          let { gen: n, schema: r } = e;
          r === !1 ? (n.var(t, !1), u(e)) : n.var(t, !0);
        }
        e.boolOrEmptySchema = l;
        function u(e, n) {
          let { gen: r, data: i } = e,
            a = {
              gen: r,
              keyword: `false schema`,
              data: i,
              schema: !1,
              schemaCode: !1,
              schemaValue: !1,
              params: {},
              it: e,
            };
          (0, t.reportError)(a, s, void 0, n);
        }
      }),
      c = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.getRules = e.isJSONType = void 0));
        let t = /* @__PURE__ */ new Set([
          `string`,
          `number`,
          `integer`,
          `boolean`,
          `null`,
          `object`,
          `array`,
        ]);
        function n(e) {
          return typeof e == `string` && t.has(e);
        }
        e.isJSONType = n;
        function r() {
          let e = {
            number: { type: `number`, rules: [] },
            string: { type: `string`, rules: [] },
            array: { type: `array`, rules: [] },
            object: { type: `object`, rules: [] },
          };
          return {
            types: { ...e, integer: !0, boolean: !0, null: !0 },
            rules: [{ rules: [] }, e.number, e.string, e.array, e.object],
            post: { rules: [] },
            all: {},
            keywords: {},
          };
        }
        e.getRules = r;
      }),
      l = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.shouldUseRule = e.shouldUseGroup = e.schemaHasRulesForType = void 0));
        function t({ schema: e, self: t }, r) {
          let i = t.RULES.types[r];
          return i && i !== !0 && n(e, i);
        }
        e.schemaHasRulesForType = t;
        function n(e, t) {
          return t.rules.some((t) => r(e, t));
        }
        e.shouldUseGroup = n;
        function r(e, t) {
          return e[t.keyword] !== void 0 || t.definition.implements?.some((t) => e[t] !== void 0);
        }
        e.shouldUseRule = r;
      }),
      u = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.reportTypeError =
            e.checkDataTypes =
            e.checkDataType =
            e.coerceAndCheckDataType =
            e.getJSONTypes =
            e.getSchemaTypes =
            e.DataType =
              void 0));
        let t = c(),
          n = l(),
          a = o(),
          s = r(),
          u = i();
        var d;
        (function (e) {
          ((e[(e.Correct = 0)] = `Correct`), (e[(e.Wrong = 1)] = `Wrong`));
        })(d || (e.DataType = d = {}));
        function f(e) {
          let t = p(e.type);
          if (t.includes(`null`)) {
            if (e.nullable === !1) throw Error(`type: null contradicts nullable: false`);
          } else {
            if (!t.length && e.nullable !== void 0)
              throw Error(`"nullable" cannot be used without "type"`);
            e.nullable === !0 && t.push(`null`);
          }
          return t;
        }
        e.getSchemaTypes = f;
        function p(e) {
          let n = Array.isArray(e) ? e : e ? [e] : [];
          if (n.every(t.isJSONType)) return n;
          throw Error(`type must be JSONType or JSONType[]: ` + n.join(`,`));
        }
        e.getJSONTypes = p;
        function m(e, t) {
          let { gen: r, data: i, opts: a } = e,
            o = g(t, a.coerceTypes),
            s =
              t.length > 0 &&
              !(o.length === 0 && t.length === 1 && (0, n.schemaHasRulesForType)(e, t[0]));
          if (s) {
            let n = b(t, i, a.strictNumbers, d.Wrong);
            r.if(n, () => {
              o.length ? _(e, t, o) : S(e);
            });
          }
          return s;
        }
        e.coerceAndCheckDataType = m;
        let h = /* @__PURE__ */ new Set([`string`, `number`, `integer`, `boolean`, `null`]);
        function g(e, t) {
          return t ? e.filter((e) => h.has(e) || (t === `array` && e === `array`)) : [];
        }
        function _(e, t, n) {
          let { gen: r, data: i, opts: a } = e,
            o = r.let(`dataType`, (0, s._)`typeof ${i}`),
            c = r.let(`coerced`, (0, s._)`undefined`);
          (a.coerceTypes === `array` &&
            r.if((0, s._)`${o} == 'object' && Array.isArray(${i}) && ${i}.length == 1`, () =>
              r
                .assign(i, (0, s._)`${i}[0]`)
                .assign(o, (0, s._)`typeof ${i}`)
                .if(b(t, i, a.strictNumbers), () => r.assign(c, i)),
            ),
            r.if((0, s._)`${c} !== undefined`));
          for (let e of n) (h.has(e) || (e === `array` && a.coerceTypes === `array`)) && l(e);
          (r.else(),
            S(e),
            r.endIf(),
            r.if((0, s._)`${c} !== undefined`, () => {
              (r.assign(i, c), v(e, c));
            }));
          function l(e) {
            switch (e) {
              case `string`:
                r.elseIf((0, s._)`${o} == "number" || ${o} == "boolean"`)
                  .assign(c, (0, s._)`"" + ${i}`)
                  .elseIf((0, s._)`${i} === null`)
                  .assign(c, (0, s._)`""`);
                return;
              case `number`:
                r.elseIf(
                  (0, s._)`${o} == "boolean" || ${i} === null
              || (${o} == "string" && ${i} && ${i} == +${i})`,
                ).assign(c, (0, s._)`+${i}`);
                return;
              case `integer`:
                r.elseIf(
                  (0, s._)`${o} === "boolean" || ${i} === null
              || (${o} === "string" && ${i} && ${i} == +${i} && !(${i} % 1))`,
                ).assign(c, (0, s._)`+${i}`);
                return;
              case `boolean`:
                r.elseIf((0, s._)`${i} === "false" || ${i} === 0 || ${i} === null`)
                  .assign(c, !1)
                  .elseIf((0, s._)`${i} === "true" || ${i} === 1`)
                  .assign(c, !0);
                return;
              case `null`:
                (r.elseIf((0, s._)`${i} === "" || ${i} === 0 || ${i} === false`),
                  r.assign(c, null));
                return;
              case `array`:
                r.elseIf(
                  (0, s._)`${o} === "string" || ${o} === "number"
              || ${o} === "boolean" || ${i} === null`,
                ).assign(c, (0, s._)`[${i}]`);
            }
          }
        }
        function v({ gen: e, parentData: t, parentDataProperty: n }, r) {
          e.if((0, s._)`${t} !== undefined`, () => e.assign((0, s._)`${t}[${n}]`, r));
        }
        function y(e, t, n, r = d.Correct) {
          let i = r === d.Correct ? s.operators.EQ : s.operators.NEQ,
            a;
          switch (e) {
            case `null`:
              return (0, s._)`${t} ${i} null`;
            case `array`:
              a = (0, s._)`Array.isArray(${t})`;
              break;
            case `object`:
              a = (0, s._)`${t} && typeof ${t} == "object" && !Array.isArray(${t})`;
              break;
            case `integer`:
              a = o((0, s._)`!(${t} % 1) && !isNaN(${t})`);
              break;
            case `number`:
              a = o();
              break;
            default:
              return (0, s._)`typeof ${t} ${i} ${e}`;
          }
          return r === d.Correct ? a : (0, s.not)(a);
          function o(e = s.nil) {
            return (0, s.and)(
              (0, s._)`typeof ${t} == "number"`,
              e,
              n ? (0, s._)`isFinite(${t})` : s.nil,
            );
          }
        }
        e.checkDataType = y;
        function b(e, t, n, r) {
          if (e.length === 1) return y(e[0], t, n, r);
          let i,
            a = (0, u.toHash)(e);
          if (a.array && a.object) {
            let e = (0, s._)`typeof ${t} != "object"`;
            ((i = a.null ? e : (0, s._)`!${t} || ${e}`),
              delete a.null,
              delete a.array,
              delete a.object);
          } else i = s.nil;
          a.number && delete a.integer;
          for (let e in a) i = (0, s.and)(i, y(e, t, n, r));
          return i;
        }
        e.checkDataTypes = b;
        let x = {
          message: ({ schema: e }) => `must be ${e}`,
          params: ({ schema: e, schemaValue: t }) =>
            typeof e == `string` ? (0, s._)`{type: ${e}}` : (0, s._)`{type: ${t}}`,
        };
        function S(e) {
          let t = C(e);
          (0, a.reportError)(t, x);
        }
        e.reportTypeError = S;
        function C(e) {
          let { gen: t, data: n, schema: r } = e,
            i = (0, u.schemaRefOrVal)(e, r, `type`);
          return {
            gen: t,
            keyword: `type`,
            data: n,
            schema: r.type,
            schemaCode: i,
            schemaValue: i,
            parentSchema: r,
            params: {},
            it: e,
          };
        }
      }),
      d = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }), (e.assignDefaults = void 0));
        let t = r(),
          n = i();
        function a(e, t) {
          let { properties: n, items: r } = e.schema;
          if (t === `object` && n) for (let t in n) o(e, t, n[t].default);
          else t === `array` && Array.isArray(r) && r.forEach((t, n) => o(e, n, t.default));
        }
        e.assignDefaults = a;
        function o(e, r, i) {
          let { gen: a, compositeRule: o, data: s, opts: c } = e;
          if (i === void 0) return;
          let l = (0, t._)`${s}${(0, t.getProperty)(r)}`;
          if (o) {
            (0, n.checkStrictMode)(e, `default is ignored for: ${l}`);
            return;
          }
          let u = (0, t._)`${l} === undefined`;
          (c.useDefaults === `empty` && (u = (0, t._)`${u} || ${l} === null || ${l} === ""`),
            a.if(u, (0, t._)`${l} = ${(0, t.stringify)(i)}`));
        }
      }),
      f = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.validateUnion =
            e.validateArray =
            e.usePattern =
            e.callValidateCode =
            e.schemaProperties =
            e.allSchemaProperties =
            e.noPropertyInData =
            e.propertyInData =
            e.isOwnProperty =
            e.hasPropFunc =
            e.reportMissingProp =
            e.checkMissingProp =
            e.checkReportMissingProp =
              void 0));
        let t = r(),
          n = i(),
          o = a(),
          s = i();
        function c(e, n) {
          let { gen: r, data: i, it: a } = e;
          r.if(m(r, i, n, a.opts.ownProperties), () => {
            (e.setParams({ missingProperty: (0, t._)`${n}` }, !0), e.error());
          });
        }
        e.checkReportMissingProp = c;
        function l({ gen: e, data: n, it: { opts: r } }, i, a) {
          return (0, t.or)(
            ...i.map((i) => (0, t.and)(m(e, n, i, r.ownProperties), (0, t._)`${a} = ${i}`)),
          );
        }
        e.checkMissingProp = l;
        function u(e, t) {
          (e.setParams({ missingProperty: t }, !0), e.error());
        }
        e.reportMissingProp = u;
        function d(e) {
          return e.scopeValue(`func`, {
            ref: Object.prototype.hasOwnProperty,
            code: (0, t._)`Object.prototype.hasOwnProperty`,
          });
        }
        e.hasPropFunc = d;
        function f(e, n, r) {
          return (0, t._)`${d(e)}.call(${n}, ${r})`;
        }
        e.isOwnProperty = f;
        function p(e, n, r, i) {
          let a = (0, t._)`${n}${(0, t.getProperty)(r)} !== undefined`;
          return i ? (0, t._)`${a} && ${f(e, n, r)}` : a;
        }
        e.propertyInData = p;
        function m(e, n, r, i) {
          let a = (0, t._)`${n}${(0, t.getProperty)(r)} === undefined`;
          return i ? (0, t.or)(a, (0, t.not)(f(e, n, r))) : a;
        }
        e.noPropertyInData = m;
        function h(e) {
          return e ? Object.keys(e).filter((e) => e !== `__proto__`) : [];
        }
        e.allSchemaProperties = h;
        function g(e, t) {
          return h(t).filter((r) => !(0, n.alwaysValidSchema)(e, t[r]));
        }
        e.schemaProperties = g;
        function _(
          {
            schemaCode: e,
            data: n,
            it: { gen: r, topSchemaRef: i, schemaPath: a, errorPath: s },
            it: c,
          },
          l,
          u,
          d,
        ) {
          let f = d ? (0, t._)`${e}, ${n}, ${i}${a}` : n,
            p = [
              [o.default.instancePath, (0, t.strConcat)(o.default.instancePath, s)],
              [o.default.parentData, c.parentData],
              [o.default.parentDataProperty, c.parentDataProperty],
              [o.default.rootData, o.default.rootData],
            ];
          c.opts.dynamicRef && p.push([o.default.dynamicAnchors, o.default.dynamicAnchors]);
          let m = (0, t._)`${f}, ${r.object(...p)}`;
          return u === t.nil ? (0, t._)`${l}(${m})` : (0, t._)`${l}.call(${u}, ${m})`;
        }
        e.callValidateCode = _;
        let v = (0, t._)`new RegExp`;
        function y({ gen: e, it: { opts: n } }, r) {
          let i = n.unicodeRegExp ? `u` : ``,
            { regExp: a } = n.code,
            o = a(r, i);
          return e.scopeValue(`pattern`, {
            key: o.toString(),
            ref: o,
            code: (0, t._)`${a.code === `new RegExp` ? v : (0, s.useFunc)(e, a)}(${r}, ${i})`,
          });
        }
        e.usePattern = y;
        function b(e) {
          let { gen: r, data: i, keyword: a, it: o } = e,
            s = r.name(`valid`);
          if (o.allErrors) {
            let e = r.let(`valid`, !0);
            return (c(() => r.assign(e, !1)), e);
          }
          return (r.var(s, !0), c(() => r.break()), s);
          function c(o) {
            let c = r.const(`len`, (0, t._)`${i}.length`);
            r.forRange(`i`, 0, c, (i) => {
              (e.subschema({ keyword: a, dataProp: i, dataPropType: n.Type.Num }, s),
                r.if((0, t.not)(s), o));
            });
          }
        }
        e.validateArray = b;
        function x(e) {
          let { gen: r, schema: i, keyword: a, it: o } = e;
          /* istanbul ignore if */
          if (!Array.isArray(i)) throw Error(`ajv implementation error`);
          if (i.some((e) => (0, n.alwaysValidSchema)(o, e)) && !o.opts.unevaluated) return;
          let s = r.let(`valid`, !1),
            c = r.name(`_valid`);
          (r.block(() =>
            i.forEach((n, i) => {
              let o = e.subschema({ keyword: a, schemaProp: i, compositeRule: !0 }, c);
              (r.assign(s, (0, t._)`${s} || ${c}`),
                e.mergeValidEvaluated(o, c) || r.if((0, t.not)(s)));
            }),
          ),
            e.result(
              s,
              () => e.reset(),
              () => e.error(!0),
            ));
        }
        e.validateUnion = x;
      }),
      p = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.validateKeywordUsage =
            e.validSchemaType =
            e.funcKeywordCode =
            e.macroKeywordCode =
              void 0));
        let t = r(),
          n = a(),
          i = f(),
          s = o();
        function c(e, n) {
          let { gen: r, keyword: i, schema: a, parentSchema: o, it: s } = e,
            c = n.macro.call(s.self, a, o, s),
            l = m(r, i, c);
          s.opts.validateSchema !== !1 && s.self.validateSchema(c, !0);
          let u = r.name(`valid`);
          (e.subschema(
            {
              schema: c,
              schemaPath: t.nil,
              errSchemaPath: `${s.errSchemaPath}/${i}`,
              topSchemaRef: l,
              compositeRule: !0,
            },
            u,
          ),
            e.pass(u, () => e.error(!0)));
        }
        e.macroKeywordCode = c;
        function l(e, r) {
          let { gen: a, keyword: o, schema: s, parentSchema: c, $data: l, it: f } = e;
          p(f, r);
          let h = m(a, o, !l && r.compile ? r.compile.call(f.self, s, c, f) : r.validate),
            g = a.let(`valid`);
          (e.block$data(g, _), e.ok(r.valid ?? g));
          function _() {
            if (r.errors === !1) (b(), r.modifying && u(e), x(() => e.error()));
            else {
              let t = r.async ? v() : y();
              (r.modifying && u(e), x(() => d(e, t)));
            }
          }
          function v() {
            let e = a.let(`ruleErrs`, null);
            return (
              a.try(
                () => b((0, t._)`await `),
                (n) =>
                  a.assign(g, !1).if(
                    (0, t._)`${n} instanceof ${f.ValidationError}`,
                    () => a.assign(e, (0, t._)`${n}.errors`),
                    () => a.throw(n),
                  ),
              ),
              e
            );
          }
          function y() {
            let e = (0, t._)`${h}.errors`;
            return (a.assign(e, null), b(t.nil), e);
          }
          function b(o = r.async ? (0, t._)`await ` : t.nil) {
            let s = f.opts.passContext ? n.default.this : n.default.self,
              c = !((`compile` in r && !l) || r.schema === !1);
            a.assign(g, (0, t._)`${o}${(0, i.callValidateCode)(e, h, s, c)}`, r.modifying);
          }
          function x(e) {
            a.if((0, t.not)(r.valid ?? g), e);
          }
        }
        e.funcKeywordCode = l;
        function u(e) {
          let { gen: n, data: r, it: i } = e;
          n.if(i.parentData, () => n.assign(r, (0, t._)`${i.parentData}[${i.parentDataProperty}]`));
        }
        function d(e, r) {
          let { gen: i } = e;
          i.if(
            (0, t._)`Array.isArray(${r})`,
            () => {
              (i
                .assign(
                  n.default.vErrors,
                  (0,
                  t._)`${n.default.vErrors} === null ? ${r} : ${n.default.vErrors}.concat(${r})`,
                )
                .assign(n.default.errors, (0, t._)`${n.default.vErrors}.length`),
                (0, s.extendErrors)(e));
            },
            () => e.error(),
          );
        }
        function p({ schemaEnv: e }, t) {
          if (t.async && !e.$async) throw Error(`async keyword in sync schema`);
        }
        function m(e, n, r) {
          if (r === void 0) throw Error(`keyword "${n}" failed to compile`);
          return e.scopeValue(
            `keyword`,
            typeof r == `function` ? { ref: r } : { ref: r, code: (0, t.stringify)(r) },
          );
        }
        function h(e, t, n = !1) {
          return (
            !t.length ||
            t.some((t) =>
              t === `array`
                ? Array.isArray(e)
                : t === `object`
                  ? e && typeof e == `object` && !Array.isArray(e)
                  : typeof e == t || (n && e === void 0),
            )
          );
        }
        e.validSchemaType = h;
        function g({ schema: e, opts: t, self: n, errSchemaPath: r }, i, a) {
          /* istanbul ignore if */
          if (Array.isArray(i.keyword) ? !i.keyword.includes(a) : i.keyword !== a)
            throw Error(`ajv implementation error`);
          let o = i.dependencies;
          if (o?.some((t) => !Object.prototype.hasOwnProperty.call(e, t)))
            throw Error(`parent schema must have dependencies of ${a}: ${o.join(`,`)}`);
          if (i.validateSchema && !i.validateSchema(e[a])) {
            let e =
              `keyword "${a}" value is invalid at path "${r}": ` +
              n.errorsText(i.validateSchema.errors);
            if (t.validateSchema === `log`) n.logger.error(e);
            else throw Error(e);
          }
        }
        e.validateKeywordUsage = g;
      }),
      m = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.extendSubschemaMode = e.extendSubschemaData = e.getSubschema = void 0));
        let t = r(),
          n = i();
        function a(
          e,
          {
            keyword: r,
            schemaProp: i,
            schema: a,
            schemaPath: o,
            errSchemaPath: s,
            topSchemaRef: c,
          },
        ) {
          if (r !== void 0 && a !== void 0)
            throw Error(`both "keyword" and "schema" passed, only one allowed`);
          if (r !== void 0) {
            let a = e.schema[r];
            return i === void 0
              ? {
                  schema: a,
                  schemaPath: (0, t._)`${e.schemaPath}${(0, t.getProperty)(r)}`,
                  errSchemaPath: `${e.errSchemaPath}/${r}`,
                }
              : {
                  schema: a[i],
                  schemaPath: (0,
                  t._)`${e.schemaPath}${(0, t.getProperty)(r)}${(0, t.getProperty)(i)}`,
                  errSchemaPath: `${e.errSchemaPath}/${r}/${(0, n.escapeFragment)(i)}`,
                };
          }
          if (a !== void 0) {
            if (o === void 0 || s === void 0 || c === void 0)
              throw Error(
                `"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"`,
              );
            return { schema: a, schemaPath: o, topSchemaRef: c, errSchemaPath: s };
          }
          throw Error(`either "keyword" or "schema" must be passed`);
        }
        e.getSubschema = a;
        function o(e, r, { dataProp: i, dataPropType: a, data: o, dataTypes: s, propertyName: c }) {
          if (o !== void 0 && i !== void 0)
            throw Error(`both "data" and "dataProp" passed, only one allowed`);
          let { gen: l } = r;
          if (i !== void 0) {
            let { errorPath: o, dataPathArr: s, opts: c } = r;
            (u(l.let(`data`, (0, t._)`${r.data}${(0, t.getProperty)(i)}`, !0)),
              (e.errorPath = (0, t.str)`${o}${(0, n.getErrorPath)(i, a, c.jsPropertySyntax)}`),
              (e.parentDataProperty = (0, t._)`${i}`),
              (e.dataPathArr = [...s, e.parentDataProperty]));
          }
          (o !== void 0 &&
            (u(o instanceof t.Name ? o : l.let(`data`, o, !0)),
            c !== void 0 && (e.propertyName = c)),
            s && (e.dataTypes = s));
          function u(t) {
            ((e.data = t),
              (e.dataLevel = r.dataLevel + 1),
              (e.dataTypes = []),
              (r.definedProperties = /* @__PURE__ */ new Set()),
              (e.parentData = r.data),
              (e.dataNames = [...r.dataNames, t]));
          }
        }
        e.extendSubschemaData = o;
        function s(
          e,
          { jtdDiscriminator: t, jtdMetadata: n, compositeRule: r, createErrors: i, allErrors: a },
        ) {
          (r !== void 0 && (e.compositeRule = r),
            i !== void 0 && (e.createErrors = i),
            a !== void 0 && (e.allErrors = a),
            (e.jtdDiscriminator = t),
            (e.jtdMetadata = n));
        }
        e.extendSubschemaMode = s;
      }),
      h = /* @__PURE__ */ e((e, t) => {
        t.exports = function e(t, n) {
          if (t === n) return !0;
          if (t && n && typeof t == `object` && typeof n == `object`) {
            if (t.constructor !== n.constructor) return !1;
            var r, i, a;
            if (Array.isArray(t)) {
              if (((r = t.length), r != n.length)) return !1;
              for (i = r; i-- !== 0;) if (!e(t[i], n[i])) return !1;
              return !0;
            }
            if (t.constructor === RegExp) return t.source === n.source && t.flags === n.flags;
            if (t.valueOf !== Object.prototype.valueOf) return t.valueOf() === n.valueOf();
            if (t.toString !== Object.prototype.toString) return t.toString() === n.toString();
            if (((a = Object.keys(t)), (r = a.length), r !== Object.keys(n).length)) return !1;
            for (i = r; i-- !== 0;) if (!Object.prototype.hasOwnProperty.call(n, a[i])) return !1;
            for (i = r; i-- !== 0;) {
              var o = a[i];
              if (!e(t[o], n[o])) return !1;
            }
            return !0;
          }
          return t !== t && n !== n;
        };
      }),
      g = /* @__PURE__ */ e((e, t) => {
        var n = (t.exports = function (e, t, n) {
          (typeof t == `function` && ((n = t), (t = {})), (n = t.cb || n));
          var i = typeof n == `function` ? n : n.pre || function () {},
            a = n.post || function () {};
          r(t, i, a, e, ``, e);
        });
        ((n.keywords = {
          additionalItems: !0,
          items: !0,
          contains: !0,
          additionalProperties: !0,
          propertyNames: !0,
          not: !0,
          if: !0,
          then: !0,
          else: !0,
        }),
          (n.arrayKeywords = { items: !0, allOf: !0, anyOf: !0, oneOf: !0 }),
          (n.propsKeywords = {
            $defs: !0,
            definitions: !0,
            properties: !0,
            patternProperties: !0,
            dependencies: !0,
          }),
          (n.skipKeywords = {
            default: !0,
            enum: !0,
            const: !0,
            required: !0,
            maximum: !0,
            minimum: !0,
            exclusiveMaximum: !0,
            exclusiveMinimum: !0,
            multipleOf: !0,
            maxLength: !0,
            minLength: !0,
            pattern: !0,
            format: !0,
            maxItems: !0,
            minItems: !0,
            uniqueItems: !0,
            maxProperties: !0,
            minProperties: !0,
          }));
        function r(e, t, a, o, s, c, l, u, d, f) {
          if (o && typeof o == `object` && !Array.isArray(o)) {
            for (var p in (t(o, s, c, l, u, d, f), o)) {
              var m = o[p];
              if (Array.isArray(m)) {
                if (p in n.arrayKeywords)
                  for (var h = 0; h < m.length; h++)
                    r(e, t, a, m[h], s + `/` + p + `/` + h, c, s, p, o, h);
              } else if (p in n.propsKeywords) {
                if (m && typeof m == `object`)
                  for (var g in m) r(e, t, a, m[g], s + `/` + p + `/` + i(g), c, s, p, o, g);
              } else
                (p in n.keywords || (e.allKeys && !(p in n.skipKeywords))) &&
                  r(e, t, a, m, s + `/` + p, c, s, p, o);
            }
            a(o, s, c, l, u, d, f);
          }
        }
        function i(e) {
          return e.replace(/~/g, `~0`).replace(/\//g, `~1`);
        }
      }),
      _ = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.getSchemaRefs =
            e.resolveUrl =
            e.normalizeId =
            e._getFullPath =
            e.getFullPath =
            e.inlineRef =
              void 0));
        let t = i(),
          n = h(),
          r = g(),
          a = /* @__PURE__ */ new Set([
            `type`,
            `format`,
            `pattern`,
            `maxLength`,
            `minLength`,
            `maxProperties`,
            `minProperties`,
            `maxItems`,
            `minItems`,
            `maximum`,
            `minimum`,
            `uniqueItems`,
            `multipleOf`,
            `required`,
            `enum`,
            `const`,
          ]);
        function o(e, t = !0) {
          return typeof e == `boolean` ? !0 : t === !0 ? !c(e) : t ? l(e) <= t : !1;
        }
        e.inlineRef = o;
        let s = /* @__PURE__ */ new Set([
          `$ref`,
          `$recursiveRef`,
          `$recursiveAnchor`,
          `$dynamicRef`,
          `$dynamicAnchor`,
        ]);
        function c(e) {
          for (let t in e) {
            if (s.has(t)) return !0;
            let n = e[t];
            if ((Array.isArray(n) && n.some(c)) || (typeof n == `object` && c(n))) return !0;
          }
          return !1;
        }
        function l(e) {
          let n = 0;
          for (let r in e)
            if (
              r === `$ref` ||
              (n++,
              !a.has(r) &&
                (typeof e[r] == `object` && (0, t.eachItem)(e[r], (e) => (n += l(e))), n === 1 / 0))
            )
              return 1 / 0;
          return n;
        }
        function u(e, t = ``, n) {
          return (n !== !1 && (t = p(t)), d(e, e.parse(t)));
        }
        e.getFullPath = u;
        function d(e, t) {
          return e.serialize(t).split(`#`)[0] + `#`;
        }
        e._getFullPath = d;
        let f = /#\/?$/;
        function p(e) {
          return e ? e.replace(f, ``) : ``;
        }
        e.normalizeId = p;
        function m(e, t, n) {
          return ((n = p(n)), e.resolve(t, n));
        }
        e.resolveUrl = m;
        let _ = /^[a-z_][-a-z0-9._]*$/i;
        function v(e, t) {
          if (typeof e == `boolean`) return {};
          let { schemaId: i, uriResolver: a } = this.opts,
            o = p(e[i] || t),
            s = { '': o },
            c = u(a, o, !1),
            l = {},
            d = /* @__PURE__ */ new Set();
          return (
            r(e, { allKeys: !0 }, (e, t, n, r) => {
              if (r === void 0) return;
              let a = c + t,
                o = s[r];
              (typeof e[i] == `string` && (o = u.call(this, e[i])),
                h.call(this, e.$anchor),
                h.call(this, e.$dynamicAnchor),
                (s[t] = o));
              function u(t) {
                let n = this.opts.uriResolver.resolve;
                if (((t = p(o ? n(o, t) : t)), d.has(t))) throw m(t);
                d.add(t);
                let r = this.refs[t];
                return (
                  typeof r == `string` && (r = this.refs[r]),
                  typeof r == `object`
                    ? f(e, r.schema, t)
                    : t !== p(a) &&
                      (t[0] === `#` ? (f(e, l[t], t), (l[t] = e)) : (this.refs[t] = a)),
                  t
                );
              }
              function h(e) {
                if (typeof e == `string`) {
                  if (!_.test(e)) throw Error(`invalid anchor "${e}"`);
                  u.call(this, `#${e}`);
                }
              }
            }),
            l
          );
          function f(e, t, r) {
            if (t !== void 0 && !n(e, t)) throw m(r);
          }
          function m(e) {
            return /* @__PURE__ */ Error(`reference "${e}" resolves to more than one schema`);
          }
        }
        e.getSchemaRefs = v;
      }),
      v = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.getData = e.KeywordCxt = e.validateFunctionCode = void 0));
        let t = s(),
          n = u(),
          c = l(),
          f = u(),
          h = d(),
          g = p(),
          v = m(),
          y = r(),
          b = a(),
          x = _(),
          S = i(),
          C = o();
        function w(e) {
          N(e) && (F(e), M(e)) ? O(e) : T(e, () => (0, t.topBoolOrEmptySchema)(e));
        }
        e.validateFunctionCode = w;
        function T({ gen: e, validateName: t, schema: n, schemaEnv: r, opts: i }, a) {
          i.code.es5
            ? e.func(t, (0, y._)`${b.default.data}, ${b.default.valCxt}`, r.$async, () => {
                (e.code((0, y._)`"use strict"; ${A(n, i)}`), D(e, i), e.code(a));
              })
            : e.func(t, (0, y._)`${b.default.data}, ${E(i)}`, r.$async, () =>
                e.code(A(n, i)).code(a),
              );
        }
        function E(e) {
          return (0,
          y._)`{${b.default.instancePath}="", ${b.default.parentData}, ${b.default.parentDataProperty}, ${b.default.rootData}=${b.default.data}${e.dynamicRef ? (0, y._)`, ${b.default.dynamicAnchors}={}` : y.nil}}={}`;
        }
        function D(e, t) {
          e.if(
            b.default.valCxt,
            () => {
              (e.var(
                b.default.instancePath,
                (0, y._)`${b.default.valCxt}.${b.default.instancePath}`,
              ),
                e.var(b.default.parentData, (0, y._)`${b.default.valCxt}.${b.default.parentData}`),
                e.var(
                  b.default.parentDataProperty,
                  (0, y._)`${b.default.valCxt}.${b.default.parentDataProperty}`,
                ),
                e.var(b.default.rootData, (0, y._)`${b.default.valCxt}.${b.default.rootData}`),
                t.dynamicRef &&
                  e.var(
                    b.default.dynamicAnchors,
                    (0, y._)`${b.default.valCxt}.${b.default.dynamicAnchors}`,
                  ));
            },
            () => {
              (e.var(b.default.instancePath, (0, y._)`""`),
                e.var(b.default.parentData, (0, y._)`undefined`),
                e.var(b.default.parentDataProperty, (0, y._)`undefined`),
                e.var(b.default.rootData, b.default.data),
                t.dynamicRef && e.var(b.default.dynamicAnchors, (0, y._)`{}`));
            },
          );
        }
        function O(e) {
          let { schema: t, opts: n, gen: r } = e;
          T(e, () => {
            (n.$comment && t.$comment && V(e),
              R(e),
              r.let(b.default.vErrors, null),
              r.let(b.default.errors, 0),
              n.unevaluated && k(e),
              I(e),
              H(e));
          });
        }
        function k(e) {
          let { gen: t, validateName: n } = e;
          ((e.evaluated = t.const(`evaluated`, (0, y._)`${n}.evaluated`)),
            t.if((0, y._)`${e.evaluated}.dynamicProps`, () =>
              t.assign((0, y._)`${e.evaluated}.props`, (0, y._)`undefined`),
            ),
            t.if((0, y._)`${e.evaluated}.dynamicItems`, () =>
              t.assign((0, y._)`${e.evaluated}.items`, (0, y._)`undefined`),
            ));
        }
        function A(e, t) {
          let n = typeof e == `object` && e[t.schemaId];
          return n && (t.code.source || t.code.process) ? (0, y._)`/*# sourceURL=${n} */` : y.nil;
        }
        function j(e, n) {
          N(e) && (F(e), M(e)) ? P(e, n) : (0, t.boolOrEmptySchema)(e, n);
        }
        function M({ schema: e, self: t }) {
          if (typeof e == `boolean`) return !e;
          for (let n in e) if (t.RULES.all[n]) return !0;
          return !1;
        }
        function N(e) {
          return typeof e.schema != `boolean`;
        }
        function P(e, t) {
          let { schema: n, gen: r, opts: i } = e;
          (i.$comment && n.$comment && V(e), z(e), B(e));
          let a = r.const(`_errs`, b.default.errors);
          (I(e, a), r.var(t, (0, y._)`${a} === ${b.default.errors}`));
        }
        function F(e) {
          ((0, S.checkUnknownRules)(e), L(e));
        }
        function I(e, t) {
          if (e.opts.jtd) return W(e, [], !1, t);
          let r = (0, n.getSchemaTypes)(e.schema);
          W(e, r, !(0, n.coerceAndCheckDataType)(e, r), t);
        }
        function L(e) {
          let { schema: t, errSchemaPath: n, opts: r, self: i } = e;
          t.$ref &&
            r.ignoreKeywordsWithRef &&
            (0, S.schemaHasRulesButRef)(t, i.RULES) &&
            i.logger.warn(`$ref: keywords ignored in schema at path "${n}"`);
        }
        function R(e) {
          let { schema: t, opts: n } = e;
          t.default !== void 0 &&
            n.useDefaults &&
            n.strictSchema &&
            (0, S.checkStrictMode)(e, `default is ignored in the schema root`);
        }
        function z(e) {
          let t = e.schema[e.opts.schemaId];
          t && (e.baseId = (0, x.resolveUrl)(e.opts.uriResolver, e.baseId, t));
        }
        function B(e) {
          if (e.schema.$async && !e.schemaEnv.$async) throw Error(`async schema in sync schema`);
        }
        function V({ gen: e, schemaEnv: t, schema: n, errSchemaPath: r, opts: i }) {
          let a = n.$comment;
          if (i.$comment === !0) e.code((0, y._)`${b.default.self}.logger.log(${a})`);
          else if (typeof i.$comment == `function`) {
            let n = (0, y.str)`${r}/$comment`,
              i = e.scopeValue(`root`, { ref: t.root });
            e.code((0, y._)`${b.default.self}.opts.$comment(${a}, ${n}, ${i}.schema)`);
          }
        }
        function H(e) {
          let { gen: t, schemaEnv: n, validateName: r, ValidationError: i, opts: a } = e;
          n.$async
            ? t.if(
                (0, y._)`${b.default.errors} === 0`,
                () => t.return(b.default.data),
                () => t.throw((0, y._)`new ${i}(${b.default.vErrors})`),
              )
            : (t.assign((0, y._)`${r}.errors`, b.default.vErrors),
              a.unevaluated && U(e),
              t.return((0, y._)`${b.default.errors} === 0`));
        }
        function U({ gen: e, evaluated: t, props: n, items: r }) {
          (n instanceof y.Name && e.assign((0, y._)`${t}.props`, n),
            r instanceof y.Name && e.assign((0, y._)`${t}.items`, r));
        }
        function W(e, t, n, r) {
          let { gen: i, schema: a, data: o, allErrors: s, opts: l, self: u } = e,
            { RULES: d } = u;
          if (a.$ref && (l.ignoreKeywordsWithRef || !(0, S.schemaHasRulesButRef)(a, d))) {
            i.block(() => Q(e, `$ref`, d.all.$ref.definition));
            return;
          }
          (l.jtd || ee(e, t),
            i.block(() => {
              for (let e of d.rules) p(e);
              p(d.post);
            }));
          function p(u) {
            (0, c.shouldUseGroup)(a, u) &&
              (u.type
                ? (i.if((0, f.checkDataType)(u.type, o, l.strictNumbers)),
                  G(e, u),
                  t.length === 1 && t[0] === u.type && n && (i.else(), (0, f.reportTypeError)(e)),
                  i.endIf())
                : G(e, u),
              s || i.if((0, y._)`${b.default.errors} === ${r || 0}`));
          }
        }
        function G(e, t) {
          let {
            gen: n,
            schema: r,
            opts: { useDefaults: i },
          } = e;
          (i && (0, h.assignDefaults)(e, t.type),
            n.block(() => {
              for (let n of t.rules)
                (0, c.shouldUseRule)(r, n) && Q(e, n.keyword, n.definition, t.type);
            }));
        }
        function ee(e, t) {
          !e.schemaEnv.meta &&
            e.opts.strictTypes &&
            (te(e, t), e.opts.allowUnionTypes || K(e, t), q(e, e.dataTypes));
        }
        function te(e, t) {
          t.length &&
            (e.dataTypes.length
              ? (t.forEach((t) => {
                  Y(e.dataTypes, t) ||
                    X(e, `type "${t}" not allowed by context "${e.dataTypes.join(`,`)}"`);
                }),
                ne(e, t))
              : (e.dataTypes = t));
        }
        function K(e, t) {
          t.length > 1 &&
            !(t.length === 2 && t.includes(`null`)) &&
            X(e, `use allowUnionTypes to allow union type keyword`);
        }
        function q(e, t) {
          let n = e.self.RULES.all;
          for (let r in n) {
            let i = n[r];
            if (typeof i == `object` && (0, c.shouldUseRule)(e.schema, i)) {
              let { type: n } = i.definition;
              n.length &&
                !n.some((e) => J(t, e)) &&
                X(e, `missing type "${n.join(`,`)}" for keyword "${r}"`);
            }
          }
        }
        function J(e, t) {
          return e.includes(t) || (t === `number` && e.includes(`integer`));
        }
        function Y(e, t) {
          return e.includes(t) || (t === `integer` && e.includes(`number`));
        }
        function ne(e, t) {
          let n = [];
          for (let r of e.dataTypes)
            Y(t, r) ? n.push(r) : t.includes(`integer`) && r === `number` && n.push(`integer`);
          e.dataTypes = n;
        }
        function X(e, t) {
          let n = e.schemaEnv.baseId + e.errSchemaPath;
          ((t += ` at "${n}" (strictTypes)`), (0, S.checkStrictMode)(e, t, e.opts.strictTypes));
        }
        var Z = class {
          constructor(e, t, n) {
            if (
              ((0, g.validateKeywordUsage)(e, t, n),
              (this.gen = e.gen),
              (this.allErrors = e.allErrors),
              (this.keyword = n),
              (this.data = e.data),
              (this.schema = e.schema[n]),
              (this.$data = t.$data && e.opts.$data && this.schema && this.schema.$data),
              (this.schemaValue = (0, S.schemaRefOrVal)(e, this.schema, n, this.$data)),
              (this.schemaType = t.schemaType),
              (this.parentSchema = e.schema),
              (this.params = {}),
              (this.it = e),
              (this.def = t),
              this.$data)
            )
              this.schemaCode = e.gen.const(`vSchema`, $(this.$data, e));
            else if (
              ((this.schemaCode = this.schemaValue),
              !(0, g.validSchemaType)(this.schema, t.schemaType, t.allowUndefined))
            )
              throw Error(`${n} value must be ${JSON.stringify(t.schemaType)}`);
            (`code` in t ? t.trackErrors : t.errors !== !1) &&
              (this.errsCount = e.gen.const(`_errs`, b.default.errors));
          }
          result(e, t, n) {
            this.failResult((0, y.not)(e), t, n);
          }
          failResult(e, t, n) {
            (this.gen.if(e),
              n ? n() : this.error(),
              t
                ? (this.gen.else(), t(), this.allErrors && this.gen.endIf())
                : this.allErrors
                  ? this.gen.endIf()
                  : this.gen.else());
          }
          pass(e, t) {
            this.failResult((0, y.not)(e), void 0, t);
          }
          fail(e) {
            e === void 0
              ? (this.error(), this.allErrors || this.gen.if(!1))
              : (this.gen.if(e), this.error(), this.allErrors ? this.gen.endIf() : this.gen.else());
          }
          fail$data(e) {
            if (!this.$data) return this.fail(e);
            let { schemaCode: t } = this;
            this.fail((0, y._)`${t} !== undefined && (${(0, y.or)(this.invalid$data(), e)})`);
          }
          error(e, t, n) {
            t ? (this.setParams(t), this._error(e, n), this.setParams({})) : this._error(e, n);
          }
          _error(e, t) {
            (e ? C.reportExtraError : C.reportError)(this, this.def.error, t);
          }
          $dataError() {
            (0, C.reportError)(this, this.def.$dataError || C.keyword$DataError);
          }
          reset() {
            if (this.errsCount === void 0) throw Error(`add "trackErrors" to keyword definition`);
            (0, C.resetErrorsCount)(this.gen, this.errsCount);
          }
          ok(e) {
            this.allErrors || this.gen.if(e);
          }
          setParams(e, t) {
            t ? Object.assign(this.params, e) : (this.params = e);
          }
          block$data(e, t, n = y.nil) {
            this.gen.block(() => {
              (this.check$data(e, n), t());
            });
          }
          check$data(e = y.nil, t = y.nil) {
            if (!this.$data) return;
            let { gen: n, schemaCode: r, schemaType: i, def: a } = this;
            (n.if((0, y.or)((0, y._)`${r} === undefined`, t)),
              e !== y.nil && n.assign(e, !0),
              (i.length || a.validateSchema) &&
                (n.elseIf(this.invalid$data()), this.$dataError(), e !== y.nil && n.assign(e, !1)),
              n.else());
          }
          invalid$data() {
            let { gen: e, schemaCode: t, schemaType: n, def: r, it: i } = this;
            return (0, y.or)(a(), o());
            function a() {
              if (n.length) {
                /* istanbul ignore if */
                if (!(t instanceof y.Name)) throw Error(`ajv implementation error`);
                let e = Array.isArray(n) ? n : [n];
                return (0,
                y._)`${(0, f.checkDataTypes)(e, t, i.opts.strictNumbers, f.DataType.Wrong)}`;
              }
              return y.nil;
            }
            function o() {
              if (r.validateSchema) {
                let n = e.scopeValue(`validate$data`, { ref: r.validateSchema });
                return (0, y._)`!${n}(${t})`;
              }
              return y.nil;
            }
          }
          subschema(e, t) {
            let n = (0, v.getSubschema)(this.it, e);
            ((0, v.extendSubschemaData)(n, this.it, e), (0, v.extendSubschemaMode)(n, e));
            let r = { ...this.it, ...n, items: void 0, props: void 0 };
            return (j(r, t), r);
          }
          mergeEvaluated(e, t) {
            let { it: n, gen: r } = this;
            n.opts.unevaluated &&
              (n.props !== !0 &&
                e.props !== void 0 &&
                (n.props = S.mergeEvaluated.props(r, e.props, n.props, t)),
              n.items !== !0 &&
                e.items !== void 0 &&
                (n.items = S.mergeEvaluated.items(r, e.items, n.items, t)));
          }
          mergeValidEvaluated(e, t) {
            let { it: n, gen: r } = this;
            if (n.opts.unevaluated && (n.props !== !0 || n.items !== !0))
              return (r.if(t, () => this.mergeEvaluated(e, y.Name)), !0);
          }
        };
        e.KeywordCxt = Z;
        function Q(e, t, n, r) {
          let i = new Z(e, n, t);
          `code` in n
            ? n.code(i, r)
            : i.$data && n.validate
              ? (0, g.funcKeywordCode)(i, n)
              : `macro` in n
                ? (0, g.macroKeywordCode)(i, n)
                : (n.compile || n.validate) && (0, g.funcKeywordCode)(i, n);
        }
        let re = /^\/(?:[^~]|~0|~1)*$/,
          ie = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
        function $(e, { dataLevel: t, dataNames: n, dataPathArr: r }) {
          let i, a;
          if (e === ``) return b.default.rootData;
          if (e[0] === `/`) {
            if (!re.test(e)) throw Error(`Invalid JSON-pointer: ${e}`);
            ((i = e), (a = b.default.rootData));
          } else {
            let o = ie.exec(e);
            if (!o) throw Error(`Invalid JSON-pointer: ${e}`);
            let s = +o[1];
            if (((i = o[2]), i === `#`)) {
              if (s >= t) throw Error(c(`property/index`, s));
              return r[t - s];
            }
            if (s > t) throw Error(c(`data`, s));
            if (((a = n[t - s]), !i)) return a;
          }
          let o = a,
            s = i.split(`/`);
          for (let e of s)
            e &&
              ((a = (0, y._)`${a}${(0, y.getProperty)((0, S.unescapeJsonPointer)(e))}`),
              (o = (0, y._)`${o} && ${a}`));
          return o;
          function c(e, n) {
            return `Cannot access ${e} ${n} levels up, current level is ${t}`;
          }
        }
        e.getData = $;
      }),
      y = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.default = class extends Error {
            constructor(e) {
              (super(`validation failed`), (this.errors = e), (this.ajv = this.validation = !0));
            }
          }));
      }),
      b = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = _();
        e.default = class extends Error {
          constructor(e, n, r, i) {
            (super(i || `can't resolve reference ${r} from id ${n}`),
              (this.missingRef = (0, t.resolveUrl)(e, n, r)),
              (this.missingSchema = (0, t.normalizeId)((0, t.getFullPath)(e, this.missingRef))));
          }
        };
      }),
      x = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.resolveSchema =
            e.getCompilingSchema =
            e.resolveRef =
            e.compileSchema =
            e.SchemaEnv =
              void 0));
        let t = r(),
          n = y(),
          o = a(),
          s = _(),
          c = i(),
          l = v();
        var u = class {
          constructor(e) {
            ((this.refs = {}), (this.dynamicAnchors = {}));
            let t;
            (typeof e.schema == `object` && (t = e.schema),
              (this.schema = e.schema),
              (this.schemaId = e.schemaId),
              (this.root = e.root || this),
              (this.baseId = e.baseId ?? (0, s.normalizeId)(t?.[e.schemaId || `$id`])),
              (this.schemaPath = e.schemaPath),
              (this.localRefs = e.localRefs),
              (this.meta = e.meta),
              (this.$async = t?.$async),
              (this.refs = {}));
          }
        };
        e.SchemaEnv = u;
        function d(e) {
          let r = m.call(this, e);
          if (r) return r;
          let i = (0, s.getFullPath)(this.opts.uriResolver, e.root.baseId),
            { es5: a, lines: c } = this.opts.code,
            { ownProperties: u } = this.opts,
            d = new t.CodeGen(this.scope, { es5: a, lines: c, ownProperties: u }),
            f;
          e.$async &&
            (f = d.scopeValue(`Error`, {
              ref: n.default,
              code: (0, t._)`require("ajv/dist/runtime/validation_error").default`,
            }));
          let p = d.scopeName(`validate`);
          e.validateName = p;
          let h = {
              gen: d,
              allErrors: this.opts.allErrors,
              data: o.default.data,
              parentData: o.default.parentData,
              parentDataProperty: o.default.parentDataProperty,
              dataNames: [o.default.data],
              dataPathArr: [t.nil],
              dataLevel: 0,
              dataTypes: [],
              definedProperties: /* @__PURE__ */ new Set(),
              topSchemaRef: d.scopeValue(
                `schema`,
                this.opts.code.source === !0
                  ? { ref: e.schema, code: (0, t.stringify)(e.schema) }
                  : { ref: e.schema },
              ),
              validateName: p,
              ValidationError: f,
              schema: e.schema,
              schemaEnv: e,
              rootId: i,
              baseId: e.baseId || i,
              schemaPath: t.nil,
              errSchemaPath: e.schemaPath || (this.opts.jtd ? `` : `#`),
              errorPath: (0, t._)`""`,
              opts: this.opts,
              self: this,
            },
            g;
          try {
            (this._compilations.add(e),
              (0, l.validateFunctionCode)(h),
              d.optimize(this.opts.code.optimize));
            let n = d.toString();
            ((g = `${d.scopeRefs(o.default.scope)}return ${n}`),
              this.opts.code.process && (g = this.opts.code.process(g, e)));
            let r = Function(`${o.default.self}`, `${o.default.scope}`, g)(this, this.scope.get());
            if (
              (this.scope.value(p, { ref: r }),
              (r.errors = null),
              (r.schema = e.schema),
              (r.schemaEnv = e),
              e.$async && (r.$async = !0),
              this.opts.code.source === !0 &&
                (r.source = { validateName: p, validateCode: n, scopeValues: d._values }),
              this.opts.unevaluated)
            ) {
              let { props: e, items: n } = h;
              ((r.evaluated = {
                props: e instanceof t.Name ? void 0 : e,
                items: n instanceof t.Name ? void 0 : n,
                dynamicProps: e instanceof t.Name,
                dynamicItems: n instanceof t.Name,
              }),
                r.source && (r.source.evaluated = (0, t.stringify)(r.evaluated)));
            }
            return ((e.validate = r), e);
          } catch (t) {
            throw (
              delete e.validate,
              delete e.validateName,
              g && this.logger.error(`Error compiling schema, function code:`, g),
              t
            );
          } finally {
            this._compilations.delete(e);
          }
        }
        e.compileSchema = d;
        function f(e, t, n) {
          n = (0, s.resolveUrl)(this.opts.uriResolver, t, n);
          let r = e.refs[n];
          if (r) return r;
          let i = g.call(this, e, n);
          if (i === void 0) {
            let r = e.localRefs?.[n],
              { schemaId: a } = this.opts;
            r && (i = new u({ schema: r, schemaId: a, root: e, baseId: t }));
          }
          if (i !== void 0) return (e.refs[n] = p.call(this, i));
        }
        e.resolveRef = f;
        function p(e) {
          return (0, s.inlineRef)(e.schema, this.opts.inlineRefs)
            ? e.schema
            : e.validate
              ? e
              : d.call(this, e);
        }
        function m(e) {
          for (let t of this._compilations) if (h(t, e)) return t;
        }
        e.getCompilingSchema = m;
        function h(e, t) {
          return e.schema === t.schema && e.root === t.root && e.baseId === t.baseId;
        }
        function g(e, t) {
          let n;
          for (; typeof (n = this.refs[t]) == `string`;) t = n;
          return n || this.schemas[t] || b.call(this, e, t);
        }
        function b(e, t) {
          let n = this.opts.uriResolver.parse(t),
            r = (0, s._getFullPath)(this.opts.uriResolver, n),
            i = (0, s.getFullPath)(this.opts.uriResolver, e.baseId, void 0);
          if (Object.keys(e.schema).length > 0 && r === i) return S.call(this, n, e);
          let a = (0, s.normalizeId)(r),
            o = this.refs[a] || this.schemas[a];
          if (typeof o == `string`) {
            let t = b.call(this, e, o);
            return typeof t?.schema == `object` ? S.call(this, n, t) : void 0;
          }
          if (typeof o?.schema == `object`) {
            if ((o.validate || d.call(this, o), a === (0, s.normalizeId)(t))) {
              let { schema: t } = o,
                { schemaId: n } = this.opts,
                r = t[n];
              return (
                r && (i = (0, s.resolveUrl)(this.opts.uriResolver, i, r)),
                new u({ schema: t, schemaId: n, root: e, baseId: i })
              );
            }
            return S.call(this, n, o);
          }
        }
        e.resolveSchema = b;
        let x = /* @__PURE__ */ new Set([
          `properties`,
          `patternProperties`,
          `enum`,
          `dependencies`,
          `definitions`,
        ]);
        function S(e, { baseId: t, schema: n, root: r }) {
          if (e.fragment?.[0] !== `/`) return;
          for (let r of e.fragment.slice(1).split(`/`)) {
            if (typeof n == `boolean`) return;
            let e = n[(0, c.unescapeFragment)(r)];
            if (e === void 0) return;
            n = e;
            let i = typeof n == `object` && n[this.opts.schemaId];
            !x.has(r) && i && (t = (0, s.resolveUrl)(this.opts.uriResolver, t, i));
          }
          let i;
          if (typeof n != `boolean` && n.$ref && !(0, c.schemaHasRulesButRef)(n, this.RULES)) {
            let e = (0, s.resolveUrl)(this.opts.uriResolver, t, n.$ref);
            i = b.call(this, r, e);
          }
          let { schemaId: a } = this.opts;
          if (
            ((i ||= new u({ schema: n, schemaId: a, root: r, baseId: t })),
            i.schema !== i.root.schema)
          )
            return i;
        }
      }),
      S = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $id: `https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#`,
          description: `Meta-schema for $data reference (JSON AnySchema extension proposal)`,
          type: `object`,
          required: [`$data`],
          properties: {
            $data: {
              type: `string`,
              anyOf: [{ format: `relative-json-pointer` }, { format: `json-pointer` }],
            },
          },
          additionalProperties: !1,
        };
      }),
      C = /* @__PURE__ */ e((e, t) => {
        let n = RegExp.prototype.test.bind(
            /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu,
          ),
          r = RegExp.prototype.test.bind(
            /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u,
          ),
          i = RegExp.prototype.test.bind(/^\d*$/u),
          a = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu),
          o = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu),
          s = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u),
          c = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u),
          l = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u),
          u = Array(256);
        {
          let e = `0123456789ABCDEF`;
          for (let t = 0; t < 256; t++) u[t] = `%` + e[t >> 4] + e[t & 15];
        }
        function d(e) {
          return e < 2048
            ? u[192 | (e >> 6)] + u[128 | (e & 63)]
            : e < 65536
              ? u[224 | (e >> 12)] + u[128 | ((e >> 6) & 63)] + u[128 | (e & 63)]
              : u[240 | (e >> 18)] +
                u[128 | ((e >> 12) & 63)] +
                u[128 | ((e >> 6) & 63)] +
                u[128 | (e & 63)];
        }
        function f(e) {
          let t = ``,
            n = 0,
            r = 0;
          for (r = 0; r < e.length; r++)
            if (((n = e[r].charCodeAt(0)), n !== 48)) {
              if (!((n >= 48 && n <= 57) || (n >= 65 && n <= 70) || (n >= 97 && n <= 102)))
                return ``;
              t += e[r];
              break;
            }
          for (r += 1; r < e.length; r++) {
            if (
              ((n = e[r].charCodeAt(0)),
              !((n >= 48 && n <= 57) || (n >= 65 && n <= 70) || (n >= 97 && n <= 102)))
            )
              return ``;
            t += e[r];
          }
          return t;
        }
        let p = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/),
          m = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/),
          h = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/),
          g = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
        function _(e) {
          if (e.length === 0) return !1;
          for (let t = 0; t < e.length; t++)
            if (!h(e[t])) {
              if (e[t] === `%` && t + 2 < e.length && a(e.slice(t + 1, t + 3))) t += 2;
              else return !1;
            }
          return !0;
        }
        function v(e) {
          let t = -1,
            n = 0,
            r = -1,
            i = 0;
          for (let a = 0; a < e.length; a++)
            e[a] === `0`
              ? (r === -1 && (r = a), i++, i > n && ((n = i), (t = r)))
              : ((r = -1), (i = 0));
          if (n < 2) return e.join(`:`);
          let a = e.slice(0, t).join(`:`),
            o = e.slice(t + n).join(`:`);
          return a + `::` + o;
        }
        function y(e) {
          let t = e.indexOf(`::`);
          if (t !== -1 && e.indexOf(`::`, t + 1) !== -1) return;
          let n = t === -1 ? e.split(`:`) : e.slice(0, t).split(`:`),
            i = t === -1 ? [] : e.slice(t + 2).split(`:`);
          t !== -1 &&
            (n.length === 1 && n[0] === `` && (n.length = 0),
            i.length === 1 && i[0] === `` && (i.length = 0));
          let a = n.concat(i),
            o = 0;
          for (let e = 0; e < a.length; e++) {
            let n = a[e];
            if (n === ``) return;
            if (n.indexOf(`.`) !== -1) {
              if (e !== a.length - 1 || (t !== -1 && i.length === 0) || !r(n)) return;
              o += 2;
            } else {
              if (!p(n)) return;
              ((a[e] = parseInt(n, 16).toString(16)), o++);
            }
          }
          if (t === -1) return o === 8 ? v(a) : void 0;
          if (o >= 8) return;
          let s = a.slice(0, n.length);
          for (let e = o; e < 8; e++) s.push(`0`);
          for (let e = n.length; e < a.length; e++) s.push(a[e]);
          return v(s);
        }
        function b(e) {
          let t = e[0] === `[` && e[e.length - 1] === `]`;
          if ((e[0] === `[` || e[e.length - 1] === `]`) && !t)
            return { host: e, isIPV6: !1, error: !0 };
          let n = t ? e.slice(1, -1) : e;
          if (t && m(n))
            return (
              (n = n.toLowerCase()),
              { host: `[${n}]`, escapedHost: n, isIPV6: !1, isIPVFuture: !0 }
            );
          if (x(n, `:`) < 2) return { host: e, isIPV6: !1, error: t };
          let r = ``,
            i = n.indexOf(`%`);
          if (i !== -1) {
            let t = n.slice(i, i + 3).toLowerCase() === `%25` ? 3 : 1;
            if (((r = n.slice(i + t)), !_(r))) return { host: e, isIPV6: !1, error: !0 };
            n = n.slice(0, i);
          }
          let a = y(n);
          return a === void 0
            ? { host: e, isIPV6: !1, error: !0 }
            : { host: a + (r ? `%` + r : ``), escapedHost: a + (r ? `%25` + r : ``), isIPV6: !0 };
        }
        function x(e, t) {
          let n = 0;
          for (let r = 0; r < e.length; r++) e[r] === t && n++;
          return n;
        }
        function S(e) {
          let t = e,
            n = [],
            r = -1,
            i = 0;
          for (; (i = t.length);) {
            if (i === 1) {
              if (t === `.`) break;
              if (t === `/`) {
                n.push(`/`);
                break;
              }
              n.push(t);
              break;
            }
            if (i === 2) {
              if (t[0] === `.`) {
                if (t[1] === `.`) break;
                if (t[1] === `/`) {
                  t = t.slice(2);
                  continue;
                }
              } else if (t[0] === `/` && (t[1] === `.` || t[1] === `/`)) {
                n.push(`/`);
                break;
              }
            } else if (i === 3 && t === `/..`) {
              (n.length !== 0 && n.pop(), n.push(`/`));
              break;
            }
            if (t[0] === `.`) {
              if (t[1] === `.`) {
                if (t[2] === `/`) {
                  t = t.slice(3);
                  continue;
                }
              } else if (t[1] === `/`) {
                t = t.slice(2);
                continue;
              }
            } else if (t[0] === `/` && t[1] === `.`) {
              if (t[2] === `/`) {
                t = t.slice(2);
                continue;
              }
              if (t[2] === `.` && t[3] === `/`) {
                ((t = t.slice(3)), n.length !== 0 && n.pop());
                continue;
              }
            }
            if ((r = t.indexOf(`/`, 1)) === -1) {
              n.push(t);
              break;
            }
            (n.push(t.slice(0, r)), (t = t.slice(r)));
          }
          return n.join(``);
        }
        function C(e) {
          if (e === `` || e[0] === `/`) return S(e);
          let t = e.split(`/`),
            n = t.length - 1,
            r = [],
            i = !1;
          for (let e = 0; e <= n; e++) {
            let a = t[e];
            a === `.` || a === `..`
              ? (a === `..` &&
                  (r.length !== 0 && r[r.length - 1] !== `..` ? r.pop() : r.push(`..`)),
                (i = e === n))
              : r.push(a);
          }
          return (
            i && r[r.length - 1] !== `..` && r.push(``),
            (r.length === 0 || r[0] === `` || r[0].includes(`:`)) && r.unshift(`.`),
            r.join(`/`)
          );
        }
        let w = { '@': `%40`, '/': `%2F`, '?': `%3F`, '#': `%23`, ':': `%3A` },
          T = /[@/?#:]/g,
          E = /[@/?#]/g;
        function D(e, t) {
          let n = t ? E : T;
          return ((n.lastIndex = 0), e.replace(n, (e) => w[e]));
        }
        function O(e, t = !1) {
          if (e.indexOf(`%`) === -1) return e;
          let n = ``;
          for (let r = 0; r < e.length; r++) {
            if (e[r] === `%` && r + 2 < e.length) {
              let i = e.slice(r + 1, r + 3);
              if (a(i)) {
                let e = i.toUpperCase(),
                  a = String.fromCharCode(parseInt(e, 16));
                (t && o(a) ? (n += a) : (n += `%` + e), (r += 2));
                continue;
              }
            }
            n += e[r];
          }
          return n;
        }
        function k(e) {
          let t = ``;
          for (let n = 0; n < e.length; n++) {
            let r = e[n];
            if (r === `%` && n + 2 < e.length) {
              let r = e.slice(n + 1, n + 3);
              if (a(r)) {
                let e = r.toUpperCase(),
                  i = String.fromCharCode(parseInt(e, 16));
                (i !== `.` && o(i) ? (t += i) : (t += `%` + e), (n += 2));
                continue;
              }
            }
            if (s(r)) t += r;
            else {
              let i = e.charCodeAt(n);
              if (i < 128) t += F(i) ? r : u[i];
              else if (i < 55296 || i > 57343) t += d(i);
              else if (i <= 56319 && n + 1 < e.length) {
                let r = e.charCodeAt(n + 1);
                r >= 56320 && r <= 57343
                  ? ((t += d(65536 + ((i - 55296) << 10) + (r - 56320))), n++)
                  : (t += d(65533));
              } else t += d(65533);
            }
          }
          return t;
        }
        function A(e, t = !1) {
          let n = ``,
            r = t && e[0] !== `/`;
          for (let t = 0; t < e.length; t++) {
            let i = e[t];
            if (i === `%` && t + 2 < e.length) {
              let r = e.slice(t + 1, t + 3);
              if (a(r)) {
                ((n += `%` + r.toUpperCase()), (t += 2));
                continue;
              }
            }
            if ((i === `/` && (r = !1), s(i) && (i !== `:` || !r))) n += i;
            else {
              let r = e.charCodeAt(t);
              if (r < 128) n += u[r];
              else if (r < 55296 || r > 57343) n += d(r);
              else if (r <= 56319 && t + 1 < e.length) {
                let i = e.charCodeAt(t + 1);
                i >= 56320 && i <= 57343
                  ? ((n += d(65536 + ((r - 55296) << 10) + (i - 56320))), t++)
                  : (n += d(65533));
              } else n += d(65533);
            }
          }
          return n;
        }
        function j(e, t) {
          let n = ``;
          for (let r = 0; r < e.length; r++) {
            let i = e[r];
            if (i === `%` && r + 2 < e.length) {
              let t = e.slice(r + 1, r + 3);
              if (a(t)) {
                ((n += `%` + t.toUpperCase()), (r += 2));
                continue;
              }
            }
            if (t(i)) n += i;
            else {
              let t = e.charCodeAt(r);
              if (t < 128) n += u[t];
              else if (t < 55296 || t > 57343) n += d(t);
              else if (t <= 56319 && r + 1 < e.length) {
                let i = e.charCodeAt(r + 1);
                i >= 56320 && i <= 57343
                  ? ((n += d(65536 + ((t - 55296) << 10) + (i - 56320))), r++)
                  : (n += d(65533));
              } else n += d(65533);
            }
          }
          return n;
        }
        function M(e) {
          return j(e, l);
        }
        function N(e) {
          return j(e, c);
        }
        function P(e) {
          return j(e, c);
        }
        function F(e) {
          return (
            (e >= 48 && e <= 57) ||
            (e >= 65 && e <= 90) ||
            (e >= 97 && e <= 122) ||
            e === 42 ||
            e === 43 ||
            e === 45 ||
            e === 46 ||
            e === 47 ||
            e === 64 ||
            e === 95
          );
        }
        function I(e) {
          let t = ``;
          for (let n = 0; n < e.length; n++) {
            let r = e[n];
            if (r === `%` && n + 2 < e.length) {
              let r = e.slice(n + 1, n + 3);
              if (a(r)) {
                let e = r.toUpperCase(),
                  i = String.fromCharCode(parseInt(e, 16));
                (o(i) ? (t += i) : (t += `%` + e), (n += 2));
                continue;
              }
            }
            if (c(r)) t += r;
            else {
              let i = e.charCodeAt(n);
              if (i < 128) t += F(i) ? r : u[i];
              else if (i < 55296 || i > 57343) t += d(i);
              else if (i <= 56319 && n + 1 < e.length) {
                let r = e.charCodeAt(n + 1);
                r >= 56320 && r <= 57343
                  ? ((t += d(65536 + ((i - 55296) << 10) + (r - 56320))), n++)
                  : (t += d(65533));
              } else t += d(65533);
            }
          }
          return t;
        }
        function L(e) {
          let t = ``;
          for (let n = 0; n < e.length; n++) {
            if (e[n] === `%` && n + 2 < e.length) {
              let r = e.slice(n + 1, n + 3);
              if (a(r)) {
                ((t += `%` + r.toUpperCase()), (n += 2));
                continue;
              }
            }
            t += escape(e[n]);
          }
          return t;
        }
        function R(e) {
          let t = [];
          if ((e.userinfo !== void 0 && (t.push(M(e.userinfo)), t.push(`@`)), e.host !== void 0)) {
            let n = e.host;
            if (!r(n)) {
              let e = b(n);
              (e.isIPV6 !== !0 && e.isIPVFuture !== !0 && ((n = O(n, !0)), (e = b(n))),
                (n = e.isIPV6 === !0 || e.isIPVFuture === !0 ? `[${e.escapedHost}]` : D(n, !1)));
            }
            t.push(n);
          }
          if (typeof e.port == `number` || typeof e.port == `string`) {
            let n = String(e.port);
            if (!i(n)) throw TypeError(`URI port is malformed.`);
            (t.push(`:`), t.push(n));
          }
          return t.length ? t.join(``) : void 0;
        }
        t.exports = {
          nonSimpleDomain: g,
          recomposeAuthority: R,
          reescapeHostDelimiters: D,
          normalizePercentEncoding: O,
          normalizePathEncoding: k,
          serializePathEncoding: A,
          normalizeQueryFragmentEncoding: I,
          encodeUserinfo: M,
          encodeQuery: N,
          encodeFragment: P,
          escapePreservingEscapes: L,
          removeDotSegments: S,
          removeDotSegmentsRelative: C,
          isIPv4: r,
          isUUID: n,
          normalizeIPv6: b,
          stringArrayToHexStripped: f,
        };
      }),
      w = /* @__PURE__ */ e((e, t) => {
        let { isUUID: n } = C(),
          r = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu,
          i = [`http`, `https`, `ws`, `wss`, `urn`, `urn:uuid`];
        function a(e) {
          return i.indexOf(e) !== -1;
        }
        function o(e) {
          return e.secure === !0
            ? !0
            : e.secure === !1
              ? !1
              : e.scheme
                ? e.scheme.length === 3 &&
                  (e.scheme[0] === `w` || e.scheme[0] === `W`) &&
                  (e.scheme[1] === `s` || e.scheme[1] === `S`) &&
                  (e.scheme[2] === `s` || e.scheme[2] === `S`)
                : !1;
        }
        function s(e) {
          return (e.host || (e.error = e.error || `HTTP URIs must have a host.`), e);
        }
        function c(e) {
          let t = String(e.scheme).toLowerCase() === `https`;
          return (
            (e.port === (t ? 443 : 80) || e.port === ``) && (e.port = void 0),
            (e.path ||= `/`),
            e
          );
        }
        function l(e) {
          return (
            (e.secure = o(e)),
            (e.resourceName = (e.path || `/`) + (e.query ? `?` + e.query : ``)),
            (e.path = void 0),
            (e.query = void 0),
            e
          );
        }
        function u(e) {
          if (
            ((e.port === (o(e) ? 443 : 80) || e.port === ``) && (e.port = void 0),
            typeof e.secure == `boolean` &&
              ((e.scheme = e.secure ? `wss` : `ws`), (e.secure = void 0)),
            e.resourceName)
          ) {
            let t = e.resourceName.indexOf(`?`),
              n = t === -1 ? e.resourceName : e.resourceName.slice(0, t);
            ((e.path = n && n !== `/` ? n : void 0),
              (e.query = t === -1 ? void 0 : e.resourceName.slice(t + 1)),
              (e.resourceName = void 0));
          }
          return ((e.fragment = void 0), e);
        }
        function d(e, t) {
          if (!e.path) return ((e.error = `URN can not be parsed`), e);
          let n = e.path.match(r);
          if (n && n[0] === e.path) {
            let r = t.scheme || e.scheme || `urn`;
            ((e.nid = n[1].toLowerCase()), (e.nss = n[2]));
            let i = y(`${r}:${t.nid || e.nid}`);
            ((e.path = void 0), i && (e = i.parse(e, t)));
          } else e.error = e.error || `URN can not be parsed.`;
          return e;
        }
        function f(e, t) {
          if (e.nid === void 0) throw Error(`URN without nid cannot be serialized`);
          let n = t.scheme || e.scheme || `urn`,
            r = e.nid.toLowerCase(),
            i = y(`${n}:${t.nid || r}`);
          i && (e = i.serialize(e, t));
          let a = e,
            o = e.nss;
          return ((a.path = `${r || t.nid}:${o}`), (t.skipEscape = !0), a);
        }
        function p(e, t) {
          let r = e;
          return (
            (r.uuid = r.nss),
            (r.nss = void 0),
            !t.tolerant && (!r.uuid || !n(r.uuid)) && (r.error = r.error || `UUID is not valid.`),
            r
          );
        }
        function m(e) {
          let t = e;
          return ((t.nss = (e.uuid || ``).toLowerCase()), t);
        }
        let h = { scheme: `http`, domainHost: !0, parse: s, serialize: c },
          g = { scheme: `https`, domainHost: h.domainHost, parse: s, serialize: c },
          _ = { scheme: `ws`, domainHost: !0, parse: l, serialize: u },
          v = {
            http: h,
            https: g,
            ws: _,
            wss: {
              scheme: `wss`,
              domainHost: _.domainHost,
              parse: _.parse,
              serialize: _.serialize,
            },
            urn: { scheme: `urn`, parse: d, serialize: f, skipNormalize: !0 },
            'urn:uuid': { scheme: `urn:uuid`, parse: p, serialize: m, skipNormalize: !0 },
          };
        Object.setPrototypeOf(v, null);
        function y(e) {
          return (e && (v[e] || v[e.toLowerCase()])) || void 0;
        }
        t.exports = { wsIsSecure: o, SCHEMES: v, isValidSchemeName: a, getSchemeHandler: y };
      }),
      T = /* @__PURE__ */ e((e, t) => {
        let {
            normalizeIPv6: n,
            removeDotSegments: r,
            removeDotSegmentsRelative: i,
            recomposeAuthority: a,
            normalizePercentEncoding: o,
            normalizePathEncoding: s,
            serializePathEncoding: c,
            normalizeQueryFragmentEncoding: l,
            encodeQuery: u,
            encodeFragment: d,
            reescapeHostDelimiters: f,
            isIPv4: p,
            nonSimpleDomain: m,
          } = C(),
          { SCHEMES: h, getSchemeHandler: g } = w(),
          _ = /^[A-Za-z][A-Za-z0-9+.-]*$/u,
          v = `URI scheme is malformed.`,
          y = `URI host is malformed.`,
          b = /[\0-\x20"#/:<>?@[\\\]^`{|}\x7F]/u;
        function x(e) {
          let t = String(e);
          if (!_.test(t)) throw TypeError(v);
          return t;
        }
        function S(e, t) {
          return (
            typeof e == `string` ? (e = V(e, t)) : typeof e == `object` && (e = B(O(e, t), t)),
            e
          );
        }
        function T(e, t, r) {
          let i = r ? Object.assign({ scheme: `null` }, r) : { scheme: `null` },
            {
              parsed: a,
              malformedAuthorityOrPort: o,
              malformedPercentEncoding: s,
              malformedSchemeSpecific: c,
              malformedHost: l,
              malformedScheme: u,
            } = z(e, i),
            {
              parsed: d,
              malformedAuthorityOrPort: f,
              malformedPercentEncoding: m,
              malformedSchemeSpecific: h,
              malformedHost: _,
              malformedScheme: v,
            } = z(t, i);
          if (o || f || s || m || c || h || l || _ || u || v)
            throw Error(a.error || d.error || `URI is malformed.`);
          let b = E(a, d, i, !0),
            x = g((r && r.scheme) || b.scheme),
            S = b.host,
            C = S !== void 0 && S !== `` && (p(S) || n(S).isIPV6);
          if (L(b, r || {}, x, C)) throw Error(y);
          I(b, r || {}, x, C);
          let w = S && S.indexOf(`%`) !== -1 && !/\P{ASCII}/u.test(S);
          if (b.error && !w) throw Error(b.error);
          return ((i.skipEscape = !0), O(b, i));
        }
        function E(e, t, n, a) {
          let o = {};
          if (
            (a || ((e = B(O(e, n), n)), (t = B(O(t, n), n))), (n ||= {}), !n.tolerant && t.scheme)
          )
            ((o.scheme = t.scheme),
              (o.userinfo = t.userinfo),
              (o.host = t.host),
              (o.port = t.port),
              (o.path = r(t.path || ``)),
              (o.query = t.query));
          else {
            if (t.userinfo !== void 0 || t.host !== void 0 || t.port !== void 0)
              ((o.userinfo = t.userinfo),
                (o.host = t.host),
                (o.port = t.port),
                (o.path = r(t.path || ``)),
                (o.query = t.query));
            else {
              if (!t.path) ((o.path = e.path), (o.query = t.query === void 0 ? e.query : t.query));
              else {
                if (t.path[0] === `/`) o.path = r(t.path);
                else {
                  let n = e.userinfo !== void 0 || e.host !== void 0 || e.port !== void 0;
                  ((o.path =
                    n && !e.path
                      ? `/` + t.path
                      : e.path
                        ? e.path.slice(0, e.path.lastIndexOf(`/`) + 1) + t.path
                        : t.path),
                    (o.path =
                      e.scheme === void 0 && !n && o.path[0] !== `/` ? i(o.path) : r(o.path)));
                }
                o.query = t.query;
              }
              ((o.userinfo = e.userinfo), (o.host = e.host), (o.port = e.port));
            }
            o.scheme = e.scheme;
          }
          return ((o.fragment = t.fragment), o);
        }
        function D(e, t, n) {
          let r = U(e, n),
            i = U(t, n);
          return r !== void 0 && i !== void 0 && r === i;
        }
        function O(e, t) {
          let n = {
              host: e.host,
              scheme: e.scheme,
              userinfo: e.userinfo,
              port: e.port,
              path: e.path,
              query: e.query,
              nid: e.nid,
              nss: e.nss,
              uuid: e.uuid,
              fragment: e.fragment,
              reference: e.reference,
              resourceName: e.resourceName,
              secure: e.secure,
              error: ``,
            },
            s = Object.assign({}, t),
            l = [];
          n.scheme &&= x(n.scheme);
          let f = g(s.scheme || n.scheme);
          f && f.serialize && f.serialize(n, s);
          let p = n.userinfo !== void 0 || n.host !== void 0 || n.port !== void 0,
            m = (n.scheme === void 0 || s.reference === `suffix`) && !p,
            h = !s.skipEscape && m;
          (n.path !== void 0 && (n.path = s.skipEscape ? o(n.path) : c(n.path, h)),
            s.reference !== `suffix` &&
              n.scheme &&
              ((n.scheme = x(n.scheme)), l.push(n.scheme, `:`)));
          let _ = a(n);
          if (
            (_ !== void 0 &&
              (s.reference !== `suffix` && l.push(`//`),
              l.push(_),
              n.path && n.path[0] !== `/` && l.push(`/`)),
            n.path !== void 0)
          ) {
            let e = n.path;
            (!s.absolutePath && (!f || !f.absolutePath) && (e = m && e[0] !== `/` ? i(e) : r(e)),
              m && (e = c(e, !0)),
              _ === void 0 && e[0] === `/` && e[1] === `/` && (e = `/%2F` + e.slice(2)),
              l.push(e));
          }
          return (
            n.query !== void 0 && l.push(`?`, u(n.query)),
            n.fragment !== void 0 && l.push(`#`, d(n.fragment)),
            l.join(``)
          );
        }
        let k =
            /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u,
          A = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/,
          j = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
        function M(e, t) {
          if (t[2] !== void 0 && e.path && e.path[0] !== `/`)
            return `URI path must start with "/" when authority is present.`;
          if (typeof e.port == `number` && (e.port < 0 || e.port > 65535))
            return `URI port is malformed.`;
        }
        function N(e) {
          if (e === void 0) return !1;
          let t = e.indexOf(`%`);
          for (; t !== -1;) {
            if (t + 2 >= e.length || !/^[\da-f]{2}$/iu.test(e.slice(t + 1, t + 3))) return !0;
            t = e.indexOf(`%`, t + 3);
          }
          return !1;
        }
        function P(e) {
          return e[0] === `[` && e[e.length - 1] === `]`;
        }
        function F(e) {
          let t = e[4];
          return N(e[3]) || (t !== void 0 && !P(t) && N(t)) || N(e[6]) || N(e[7]) || N(e[8]);
        }
        function I(e, t, n, r) {
          if (L(e, t, n, r)) return ((e.error = e.error || y), !0);
          if (
            !t.unicodeSupport &&
            (!n || !n.unicodeSupport) &&
            e.host &&
            !P(e.host) &&
            (t.domainHost || (n && n.domainHost)) &&
            r === !1 &&
            m(e.host)
          ) {
            let t;
            try {
              t = new URL(`http://` + e.host);
            } catch (t) {
              return (
                (e.error = e.error || `Host's domain name can not be converted to ASCII: ` + t),
                !0
              );
            }
            if (!R(t)) return ((e.error = e.error || y), !0);
            e.host = t.hostname;
          }
          return !1;
        }
        function L(e, t, n, r) {
          return !!(
            e.host &&
            r === !1 &&
            !P(e.host) &&
            (t.domainHost || (n && n.domainHost)) &&
            b.test(e.host)
          );
        }
        function R(e) {
          return (
            e.username === `` &&
            e.password === `` &&
            e.port === `` &&
            e.pathname === `/` &&
            e.search === `` &&
            e.hash === `` &&
            e.hostname !== ``
          );
        }
        function z(e, t) {
          let r = Object.assign({}, t),
            i = {
              scheme: void 0,
              userinfo: void 0,
              host: ``,
              port: void 0,
              path: ``,
              query: void 0,
              fragment: void 0,
            },
            a = !1,
            c = !1,
            u = !1,
            d = !1,
            m = !1,
            b = !1,
            x = !1;
          r.reference === `suffix` && (e = r.scheme ? r.scheme + `:` + e : `//` + e);
          let S = e.match(A);
          S !== null &&
            S[1].indexOf(`\\`) !== -1 &&
            ((i.error = `URI authority must not contain a literal backslash.`), (a = !0));
          let C = e.match(j);
          if (C !== null) {
            let e = C[1],
              t = e.replace(/[\t\n\r]/g, ``);
            t.length >= 2 &&
              (t.slice(0, 2) === `//`
                ? e.length !== t.length &&
                  ((i.error = i.error || `URI authority introducer must not contain whitespace.`),
                  (a = !0))
                : ((i.error = i.error || `URI authority must not contain a literal backslash.`),
                  (a = !0)));
          }
          let w = e.match(k);
          if (w) {
            ((i.scheme = w[1]),
              (i.userinfo = w[3]),
              (i.host = w[4]),
              (i.port = parseInt(w[5], 10)),
              (i.path = w[6] || ``),
              (i.query = w[7]),
              (i.fragment = w[8]),
              i.scheme !== void 0 &&
                (_.test(i.scheme)
                  ? (i.scheme = i.scheme.toLowerCase())
                  : ((i.error = i.error || v), (b = !0))),
              (c = F(w)),
              c && (i.error = i.error || `URI contains malformed percent-encoding.`),
              isNaN(i.port) && (i.port = w[5]));
            let t = M(i, w);
            if ((t !== void 0 && ((i.error = i.error || t), (a = !0)), i.host)) {
              if (p(i.host) === !1) {
                let e = P(i.host),
                  t = i.host.indexOf(`[`) !== -1 || i.host.indexOf(`]`) !== -1,
                  r = n(i.host);
                ((x = r.isIPV6 || r.isIPVFuture === !0),
                  (m = t && (!e || r.error === !0)),
                  (i.host = x ? r.host : r.host.toLowerCase()),
                  m && ((i.error = i.error || y), (a = !0)));
              } else x = !0;
            }
            ((i.reference =
              i.scheme === void 0 &&
              i.userinfo === void 0 &&
              i.host === void 0 &&
              i.port === void 0 &&
              i.query === void 0 &&
              !i.path
                ? `same-document`
                : i.scheme === void 0
                  ? `relative`
                  : i.fragment === void 0
                    ? `absolute`
                    : `uri`),
              r.reference &&
                r.reference !== `suffix` &&
                r.reference !== i.reference &&
                (i.error = i.error || `URI is not a ` + r.reference + ` reference.`));
            let S = g(r.scheme || i.scheme);
            if ((m || (d = I(i, r, S, x)), e.indexOf(`%`) !== -1 && i.host !== void 0 && !m)) {
              let e = x ? i.host : o(i.host, !0);
              (x || (e = o(e.toLowerCase())), (i.host = x || r.scheme !== `null` ? f(e, x) : e));
            }
            ((!S || (S && !S.skipNormalize)) &&
              ((i.path &&= s(i.path)), (i.query &&= l(i.query)), (i.fragment &&= l(i.fragment))),
              S && S.parse && (S.parse(i, r), S === h.urn && i.nid === void 0 && (u = !0)));
          } else i.error = i.error || `URI can not be parsed.`;
          return {
            parsed: i,
            malformedAuthorityOrPort: a,
            malformedPercentEncoding: c,
            malformedSchemeSpecific: u,
            malformedHost: d,
            malformedScheme: b,
          };
        }
        function B(e, t) {
          return z(e, t).parsed;
        }
        function V(e, t) {
          return H(e, t).normalized;
        }
        function H(e, t) {
          let {
            parsed: n,
            malformedAuthorityOrPort: r,
            malformedPercentEncoding: i,
            malformedSchemeSpecific: a,
            malformedHost: o,
            malformedScheme: s,
          } = z(e, t);
          return {
            normalized: r || i || a || o || s ? e : O(n, t),
            malformedAuthorityOrPort: r,
            malformedPercentEncoding: i,
            malformedSchemeSpecific: a,
            malformedHost: o,
            malformedScheme: s,
          };
        }
        function U(e, t) {
          if (typeof e != `string` && typeof e != `object`) return;
          let n;
          try {
            n = typeof e == `string` ? e : O(e, t);
          } catch {
            return;
          }
          let {
            normalized: r,
            malformedAuthorityOrPort: i,
            malformedPercentEncoding: a,
            malformedSchemeSpecific: o,
            malformedHost: s,
            malformedScheme: c,
          } = H(n, t);
          return i || a || o || s || c ? void 0 : r;
        }
        let W = {
          SCHEMES: h,
          normalize: S,
          resolve: T,
          resolveComponent: E,
          equal: D,
          serialize: O,
          parse: B,
        };
        ((t.exports = W), (t.exports.default = W), (t.exports.fastUri = W));
      }),
      E = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = T();
        ((t.code = `require("ajv/dist/runtime/uri").default`), (e.default = t));
      }),
      D = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.CodeGen = e.Name = e.nil = e.stringify = e.str = e._ = e.KeywordCxt = void 0));
        var t = v();
        Object.defineProperty(e, 'KeywordCxt', {
          enumerable: !0,
          get: function () {
            return t.KeywordCxt;
          },
        });
        var n = r();
        (Object.defineProperty(e, '_', {
          enumerable: !0,
          get: function () {
            return n._;
          },
        }),
          Object.defineProperty(e, 'str', {
            enumerable: !0,
            get: function () {
              return n.str;
            },
          }),
          Object.defineProperty(e, 'stringify', {
            enumerable: !0,
            get: function () {
              return n.stringify;
            },
          }),
          Object.defineProperty(e, 'nil', {
            enumerable: !0,
            get: function () {
              return n.nil;
            },
          }),
          Object.defineProperty(e, 'Name', {
            enumerable: !0,
            get: function () {
              return n.Name;
            },
          }),
          Object.defineProperty(e, 'CodeGen', {
            enumerable: !0,
            get: function () {
              return n.CodeGen;
            },
          }));
        let a = y(),
          o = b(),
          s = c(),
          l = x(),
          d = r(),
          f = _(),
          p = u(),
          m = i(),
          h = S(),
          g = E(),
          C = (e, t) => new RegExp(e, t);
        C.code = `new RegExp`;
        let w = [`removeAdditional`, `useDefaults`, `coerceTypes`],
          T = /* @__PURE__ */ new Set([
            `validate`,
            `serialize`,
            `parse`,
            `wrapper`,
            `root`,
            `schema`,
            `keyword`,
            `pattern`,
            `formats`,
            `validate$data`,
            `func`,
            `obj`,
            `Error`,
          ]),
          D = {
            errorDataPath: ``,
            format: '`validateFormats: false` can be used instead.',
            nullable: `"nullable" keyword is supported by default.`,
            jsonPointers: `Deprecated jsPropertySyntax can be used instead.`,
            extendRefs: `Deprecated ignoreKeywordsWithRef can be used instead.`,
            missingRefs: `Pass empty schema with $id that should be ignored to ajv.addSchema.`,
            processCode: 'Use option `code: {process: (code, schemaEnv: object) => string}`',
            sourceCode: 'Use option `code: {source: true}`',
            strictDefaults: 'It is default now, see option `strict`.',
            strictKeywords: 'It is default now, see option `strict`.',
            uniqueItems: `"uniqueItems" keyword is always validated.`,
            unknownFormats:
              'Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).',
            cache: `Map is used as cache, schema object as key.`,
            serialize: `Map is used as cache, schema object as key.`,
            ajvErrors: `It is default now.`,
          },
          O = {
            ignoreKeywordsWithRef: ``,
            jsPropertySyntax: ``,
            unicode: `"minLength"/"maxLength" account for unicode characters by default.`,
          };
        function k(e) {
          let t = e.strict,
            n = e.code?.optimize,
            r = n === !0 || n === void 0 ? 1 : n || 0,
            i = e.code?.regExp ?? C,
            a = e.uriResolver ?? g.default;
          return {
            strictSchema: e.strictSchema ?? t ?? !0,
            strictNumbers: e.strictNumbers ?? t ?? !0,
            strictTypes: e.strictTypes ?? t ?? `log`,
            strictTuples: e.strictTuples ?? t ?? `log`,
            strictRequired: e.strictRequired ?? t ?? !1,
            code: e.code ? { ...e.code, optimize: r, regExp: i } : { optimize: r, regExp: i },
            loopRequired: e.loopRequired ?? 200,
            loopEnum: e.loopEnum ?? 200,
            meta: e.meta ?? !0,
            messages: e.messages ?? !0,
            inlineRefs: e.inlineRefs ?? !0,
            schemaId: e.schemaId ?? `$id`,
            addUsedSchema: e.addUsedSchema ?? !0,
            validateSchema: e.validateSchema ?? !0,
            validateFormats: e.validateFormats ?? !0,
            unicodeRegExp: e.unicodeRegExp ?? !0,
            int32range: e.int32range ?? !0,
            uriResolver: a,
          };
        }
        var A = class {
          constructor(e = {}) {
            ((this.schemas = {}),
              (this.refs = {}),
              (this.formats = Object.create(null)),
              (this._compilations = /* @__PURE__ */ new Set()),
              (this._loading = {}),
              (this._cache = /* @__PURE__ */ new Map()),
              (e = this.opts = { ...e, ...k(e) }));
            let { es5: t, lines: n } = this.opts.code;
            ((this.scope = new d.ValueScope({ scope: {}, prefixes: T, es5: t, lines: n })),
              (this.logger = R(e.logger)));
            let r = e.validateFormats;
            ((e.validateFormats = !1),
              (this.RULES = (0, s.getRules)()),
              j.call(this, D, e, `NOT SUPPORTED`),
              j.call(this, O, e, `DEPRECATED`, `warn`),
              (this._metaOpts = I.call(this)),
              e.formats && P.call(this),
              this._addVocabularies(),
              this._addDefaultMetaSchema(),
              e.keywords && F.call(this, e.keywords),
              typeof e.meta == `object` && this.addMetaSchema(e.meta),
              N.call(this),
              (e.validateFormats = r));
          }
          _addVocabularies() {
            this.addKeyword(`$async`);
          }
          _addDefaultMetaSchema() {
            let { $data: e, meta: t, schemaId: n } = this.opts,
              r = h;
            (n === `id` && ((r = { ...h }), (r.id = r.$id), delete r.$id),
              t && e && this.addMetaSchema(r, r[n], !1));
          }
          defaultMeta() {
            let { meta: e, schemaId: t } = this.opts;
            return (this.opts.defaultMeta = typeof e == `object` ? e[t] || e : void 0);
          }
          validate(e, t) {
            let n;
            if (typeof e == `string`) {
              if (((n = this.getSchema(e)), !n)) throw Error(`no schema with key or ref "${e}"`);
            } else n = this.compile(e);
            let r = n(t);
            return (`$async` in n || (this.errors = n.errors), r);
          }
          compile(e, t) {
            let n = this._addSchema(e, t);
            return n.validate || this._compileSchemaEnv(n);
          }
          compileAsync(e, t) {
            if (typeof this.opts.loadSchema != `function`)
              throw Error(`options.loadSchema should be a function`);
            let { loadSchema: n } = this.opts;
            return r.call(this, e, t);
            async function r(e, t) {
              await i.call(this, e.$schema);
              let n = this._addSchema(e, t);
              return n.validate || a.call(this, n);
            }
            async function i(e) {
              e && !this.getSchema(e) && (await r.call(this, { $ref: e }, !0));
            }
            async function a(e) {
              try {
                return this._compileSchemaEnv(e);
              } catch (t) {
                if (!(t instanceof o.default)) throw t;
                return (s.call(this, t), await c.call(this, t.missingSchema), a.call(this, e));
              }
            }
            function s({ missingSchema: e, missingRef: t }) {
              if (this.refs[e]) throw Error(`AnySchema ${e} is loaded but ${t} cannot be resolved`);
            }
            async function c(e) {
              let n = await l.call(this, e);
              (this.refs[e] || (await i.call(this, n.$schema)),
                this.refs[e] || this.addSchema(n, e, t));
            }
            async function l(e) {
              let t = this._loading[e];
              if (t) return t;
              try {
                return await (this._loading[e] = n(e));
              } finally {
                delete this._loading[e];
              }
            }
          }
          addSchema(e, t, n, r = this.opts.validateSchema) {
            if (Array.isArray(e)) {
              for (let t of e) this.addSchema(t, void 0, n, r);
              return this;
            }
            let i;
            if (typeof e == `object`) {
              let { schemaId: t } = this.opts;
              if (((i = e[t]), i !== void 0 && typeof i != `string`))
                throw Error(`schema ${t} must be string`);
            }
            return (
              (t = (0, f.normalizeId)(t || i)),
              this._checkUnique(t),
              (this.schemas[t] = this._addSchema(e, n, t, r, !0)),
              this
            );
          }
          addMetaSchema(e, t, n = this.opts.validateSchema) {
            return (this.addSchema(e, t, !0, n), this);
          }
          validateSchema(e, t) {
            if (typeof e == `boolean`) return !0;
            let n;
            if (((n = e.$schema), n !== void 0 && typeof n != `string`))
              throw Error(`$schema must be a string`);
            if (((n = n || this.opts.defaultMeta || this.defaultMeta()), !n))
              return (this.logger.warn(`meta-schema not available`), (this.errors = null), !0);
            let r = this.validate(n, e);
            if (!r && t) {
              let e = `schema is invalid: ` + this.errorsText();
              if (this.opts.validateSchema === `log`) this.logger.error(e);
              else throw Error(e);
            }
            return r;
          }
          getSchema(e) {
            let t;
            for (; typeof (t = M.call(this, e)) == `string`;) e = t;
            if (t === void 0) {
              let { schemaId: n } = this.opts,
                r = new l.SchemaEnv({ schema: {}, schemaId: n });
              if (((t = l.resolveSchema.call(this, r, e)), !t)) return;
              this.refs[e] = t;
            }
            return t.validate || this._compileSchemaEnv(t);
          }
          removeSchema(e) {
            if (e instanceof RegExp)
              return (
                this._removeAllSchemas(this.schemas, e),
                this._removeAllSchemas(this.refs, e),
                this
              );
            switch (typeof e) {
              case `undefined`:
                return (
                  this._removeAllSchemas(this.schemas),
                  this._removeAllSchemas(this.refs),
                  this._cache.clear(),
                  this
                );
              case `string`: {
                let t = M.call(this, e);
                return (
                  typeof t == `object` && this._cache.delete(t.schema),
                  delete this.schemas[e],
                  delete this.refs[e],
                  this
                );
              }
              case `object`: {
                let t = e;
                this._cache.delete(t);
                let n = e[this.opts.schemaId];
                return (
                  n && ((n = (0, f.normalizeId)(n)), delete this.schemas[n], delete this.refs[n]),
                  this
                );
              }
              default:
                throw Error(`ajv.removeSchema: invalid parameter`);
            }
          }
          addVocabulary(e) {
            for (let t of e) this.addKeyword(t);
            return this;
          }
          addKeyword(e, t) {
            let n;
            if (typeof e == `string`)
              ((n = e),
                typeof t == `object` &&
                  (this.logger.warn(`these parameters are deprecated, see docs for addKeyword`),
                  (t.keyword = n)));
            else if (typeof e == `object` && t === void 0) {
              if (((t = e), (n = t.keyword), Array.isArray(n) && !n.length))
                throw Error(`addKeywords: keyword must be string or non-empty array`);
            } else throw Error(`invalid addKeywords parameters`);
            if ((B.call(this, n, t), !t)) return ((0, m.eachItem)(n, (e) => V.call(this, e)), this);
            U.call(this, t);
            let r = {
              ...t,
              type: (0, p.getJSONTypes)(t.type),
              schemaType: (0, p.getJSONTypes)(t.schemaType),
            };
            return (
              (0, m.eachItem)(
                n,
                r.type.length === 0
                  ? (e) => V.call(this, e, r)
                  : (e) => r.type.forEach((t) => V.call(this, e, r, t)),
              ),
              this
            );
          }
          getKeyword(e) {
            let t = this.RULES.all[e];
            return typeof t == `object` ? t.definition : !!t;
          }
          removeKeyword(e) {
            let { RULES: t } = this;
            (delete t.keywords[e], delete t.all[e]);
            for (let n of t.rules) {
              let t = n.rules.findIndex((t) => t.keyword === e);
              t >= 0 && n.rules.splice(t, 1);
            }
            return this;
          }
          addFormat(e, t) {
            return (typeof t == `string` && (t = new RegExp(t)), (this.formats[e] = t), this);
          }
          errorsText(e = this.errors, { separator: t = `, `, dataVar: n = `data` } = {}) {
            return !e || e.length === 0
              ? `No errors`
              : e.map((e) => `${n}${e.instancePath} ${e.message}`).reduce((e, n) => e + t + n);
          }
          $dataMetaSchema(e, t) {
            let n = this.RULES.all;
            e = JSON.parse(JSON.stringify(e));
            for (let r of t) {
              let t = r.split(`/`).slice(1),
                i = e;
              for (let e of t) i = i[e];
              for (let e in n) {
                let t = n[e];
                if (typeof t != `object`) continue;
                let { $data: r } = t.definition,
                  a = i[e];
                r && a && (i[e] = G(a));
              }
            }
            return e;
          }
          _removeAllSchemas(e, t) {
            for (let n in e) {
              let r = e[n];
              (!t || t.test(n)) &&
                (typeof r == `string`
                  ? delete e[n]
                  : r && !r.meta && (this._cache.delete(r.schema), delete e[n]));
            }
          }
          _addSchema(e, t, n, r = this.opts.validateSchema, i = this.opts.addUsedSchema) {
            let a,
              { schemaId: o } = this.opts;
            if (typeof e == `object`) a = e[o];
            else if (this.opts.jtd) throw Error(`schema must be object`);
            else if (typeof e != `boolean`) throw Error(`schema must be object or boolean`);
            let s = this._cache.get(e);
            if (s !== void 0) return s;
            n = (0, f.normalizeId)(a || n);
            let c = f.getSchemaRefs.call(this, e, n);
            return (
              (s = new l.SchemaEnv({ schema: e, schemaId: o, meta: t, baseId: n, localRefs: c })),
              this._cache.set(s.schema, s),
              i && !n.startsWith(`#`) && (n && this._checkUnique(n), (this.refs[n] = s)),
              r && this.validateSchema(e, !0),
              s
            );
          }
          _checkUnique(e) {
            if (this.schemas[e] || this.refs[e])
              throw Error(`schema with key or id "${e}" already exists`);
          }
          _compileSchemaEnv(e) {
            /* istanbul ignore if */
            if ((e.meta ? this._compileMetaSchema(e) : l.compileSchema.call(this, e), !e.validate))
              throw Error(`ajv implementation error`);
            return e.validate;
          }
          _compileMetaSchema(e) {
            let t = this.opts;
            this.opts = this._metaOpts;
            try {
              l.compileSchema.call(this, e);
            } finally {
              this.opts = t;
            }
          }
        };
        ((A.ValidationError = a.default), (A.MissingRefError = o.default), (e.default = A));
        function j(e, t, n, r = `error`) {
          for (let i in e) {
            let a = i;
            a in t && this.logger[r](`${n}: option ${i}. ${e[a]}`);
          }
        }
        function M(e) {
          return ((e = (0, f.normalizeId)(e)), this.schemas[e] || this.refs[e]);
        }
        function N() {
          let e = this.opts.schemas;
          if (e) {
            if (Array.isArray(e)) this.addSchema(e);
            else for (let t in e) this.addSchema(e[t], t);
          }
        }
        function P() {
          for (let e in this.opts.formats) {
            let t = this.opts.formats[e];
            t && this.addFormat(e, t);
          }
        }
        function F(e) {
          if (Array.isArray(e)) this.addVocabulary(e);
          else {
            this.logger.warn(`keywords option as map is deprecated, pass array`);
            for (let t in e) {
              let n = e[t];
              ((n.keyword ||= t), this.addKeyword(n));
            }
          }
        }
        function I() {
          let e = { ...this.opts };
          for (let t of w) delete e[t];
          return e;
        }
        let L = { log() {}, warn() {}, error() {} };
        function R(e) {
          if (e === !1) return L;
          if (e === void 0) return console;
          if (e.log && e.warn && e.error) return e;
          throw Error(`logger must implement log, warn and error methods`);
        }
        let z = /^[a-z_$][a-z0-9_$:-]*$/i;
        function B(e, t) {
          let { RULES: n } = this;
          if (
            ((0, m.eachItem)(e, (e) => {
              if (n.keywords[e]) throw Error(`Keyword ${e} is already defined`);
              if (!z.test(e)) throw Error(`Keyword ${e} has invalid name`);
            }),
            t && t.$data && !(`code` in t || `validate` in t))
          )
            throw Error(`$data keyword must have "code" or "validate" function`);
        }
        function V(e, t, n) {
          var r;
          let i = t?.post;
          if (n && i) throw Error(`keyword with "post" flag cannot have "type"`);
          let { RULES: a } = this,
            o = i ? a.post : a.rules.find(({ type: e }) => e === n);
          if ((o || ((o = { type: n, rules: [] }), a.rules.push(o)), (a.keywords[e] = !0), !t))
            return;
          let s = {
            keyword: e,
            definition: {
              ...t,
              type: (0, p.getJSONTypes)(t.type),
              schemaType: (0, p.getJSONTypes)(t.schemaType),
            },
          };
          (t.before ? H.call(this, o, s, t.before) : o.rules.push(s),
            (a.all[e] = s),
            (r = t.implements) == null || r.forEach((e) => this.addKeyword(e)));
        }
        function H(e, t, n) {
          let r = e.rules.findIndex((e) => e.keyword === n);
          r >= 0
            ? e.rules.splice(r, 0, t)
            : (e.rules.push(t), this.logger.warn(`rule ${n} is not defined`));
        }
        function U(e) {
          let { metaSchema: t } = e;
          t !== void 0 &&
            (e.$data && this.opts.$data && (t = G(t)), (e.validateSchema = this.compile(t, !0)));
        }
        let W = {
          $ref: `https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#`,
        };
        function G(e) {
          return { anyOf: [e, W] };
        }
      }),
      O = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.default = {
            keyword: `id`,
            code() {
              throw Error(`NOT SUPPORTED: keyword "id", use "$id" for schema ID`);
            },
          }));
      }),
      k = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.callRef = e.getValidate = void 0));
        let t = b(),
          n = f(),
          o = r(),
          s = a(),
          c = x(),
          l = i(),
          u = {
            keyword: `$ref`,
            schemaType: `string`,
            code(e) {
              let { gen: n, schema: r, it: i } = e,
                { baseId: a, schemaEnv: s, validateName: l, opts: u, self: f } = i,
                { root: m } = s;
              if ((r === `#` || r === `#/`) && a === m.baseId) return g();
              let h = c.resolveRef.call(f, m, a, r);
              if (h === void 0) throw new t.default(i.opts.uriResolver, a, r);
              return h instanceof c.SchemaEnv ? _(h) : v(h);
              function g() {
                if (s === m) return p(e, l, s, s.$async);
                let t = n.scopeValue(`root`, { ref: m });
                return p(e, (0, o._)`${t}.validate`, m, m.$async);
              }
              function _(t) {
                p(e, d(e, t), t, t.$async);
              }
              function v(t) {
                let i = n.scopeValue(
                    `schema`,
                    u.code.source === !0 ? { ref: t, code: (0, o.stringify)(t) } : { ref: t },
                  ),
                  a = n.name(`valid`),
                  s = e.subschema(
                    {
                      schema: t,
                      dataTypes: [],
                      schemaPath: o.nil,
                      topSchemaRef: i,
                      errSchemaPath: r,
                    },
                    a,
                  );
                (e.mergeEvaluated(s), e.ok(a));
              }
            },
          };
        function d(e, t) {
          let { gen: n } = e;
          return t.validate
            ? n.scopeValue(`validate`, { ref: t.validate })
            : (0, o._)`${n.scopeValue(`wrapper`, { ref: t })}.validate`;
        }
        e.getValidate = d;
        function p(e, t, r, i) {
          let { gen: a, it: c } = e,
            { allErrors: u, schemaEnv: d, opts: f } = c,
            p = f.passContext ? s.default.this : o.nil;
          i ? m() : h();
          function m() {
            if (!d.$async) throw Error(`async schema referenced by sync schema`);
            let r = a.let(`valid`);
            (a.try(
              () => {
                (a.code((0, o._)`await ${(0, n.callValidateCode)(e, t, p)}`),
                  _(t),
                  u || a.assign(r, !0));
              },
              (e) => {
                (a.if((0, o._)`!(${e} instanceof ${c.ValidationError})`, () => a.throw(e)),
                  g(e),
                  u || a.assign(r, !1));
              },
            ),
              e.ok(r));
          }
          function h() {
            e.result(
              (0, n.callValidateCode)(e, t, p),
              () => _(t),
              () => g(t),
            );
          }
          function g(e) {
            let t = (0, o._)`${e}.errors`;
            (a.assign(
              s.default.vErrors,
              (0, o._)`${s.default.vErrors} === null ? ${t} : ${s.default.vErrors}.concat(${t})`,
            ),
              a.assign(s.default.errors, (0, o._)`${s.default.vErrors}.length`));
          }
          function _(e) {
            if (!c.opts.unevaluated) return;
            let t = r?.validate?.evaluated;
            if (c.props !== !0) {
              if (t && !t.dynamicProps)
                t.props !== void 0 && (c.props = l.mergeEvaluated.props(a, t.props, c.props));
              else {
                let t = a.var(`props`, (0, o._)`${e}.evaluated.props`);
                c.props = l.mergeEvaluated.props(a, t, c.props, o.Name);
              }
            }
            if (c.items !== !0) {
              if (t && !t.dynamicItems)
                t.items !== void 0 && (c.items = l.mergeEvaluated.items(a, t.items, c.items));
              else {
                let t = a.var(`items`, (0, o._)`${e}.evaluated.items`);
                c.items = l.mergeEvaluated.items(a, t, c.items, o.Name);
              }
            }
          }
        }
        ((e.callRef = p), (e.default = u));
      }),
      A = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = O(),
          n = k();
        e.default = [
          `$schema`,
          `$id`,
          `$defs`,
          `$vocabulary`,
          { keyword: `$comment` },
          `definitions`,
          t.default,
          n.default,
        ];
      }),
      j = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = t.operators,
          i = {
            maximum: { okStr: `<=`, ok: n.LTE, fail: n.GT },
            minimum: { okStr: `>=`, ok: n.GTE, fail: n.LT },
            exclusiveMaximum: { okStr: `<`, ok: n.LT, fail: n.GTE },
            exclusiveMinimum: { okStr: `>`, ok: n.GT, fail: n.LTE },
          };
        e.default = {
          keyword: Object.keys(i),
          type: `number`,
          schemaType: `number`,
          $data: !0,
          error: {
            message: ({ keyword: e, schemaCode: n }) => (0, t.str)`must be ${i[e].okStr} ${n}`,
            params: ({ keyword: e, schemaCode: n }) =>
              (0, t._)`{comparison: ${i[e].okStr}, limit: ${n}}`,
          },
          code(e) {
            let { keyword: n, data: r, schemaCode: a } = e;
            e.fail$data((0, t._)`${r} ${i[n].fail} ${a} || isNaN(${r})`);
          },
        };
      }),
      M = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r();
        e.default = {
          keyword: `multipleOf`,
          type: `number`,
          schemaType: `number`,
          $data: !0,
          error: {
            message: ({ schemaCode: e }) => (0, t.str)`must be multiple of ${e}`,
            params: ({ schemaCode: e }) => (0, t._)`{multipleOf: ${e}}`,
          },
          code(e) {
            let { gen: n, data: r, schemaCode: i, it: a } = e,
              o = a.opts.multipleOfPrecision,
              s = n.let(`res`),
              c = o
                ? (0, t._)`Math.abs(Math.round(${s}) - ${s}) > 1e-${o}`
                : (0, t._)`${s} !== parseInt(${s})`;
            e.fail$data((0, t._)`(${i} === 0 || (${s} = ${r}/${i}, ${c}))`);
          },
        };
      }),
      N = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        function t(e) {
          let t = e.length,
            n = 0,
            r = 0,
            i;
          for (; r < t;)
            (n++,
              (i = e.charCodeAt(r++)),
              i >= 55296 &&
                i <= 56319 &&
                r < t &&
                ((i = e.charCodeAt(r)), (i & 64512) == 56320 && r++));
          return n;
        }
        ((e.default = t), (t.code = `require("ajv/dist/runtime/ucs2length").default`));
      }),
      P = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i(),
          a = N();
        e.default = {
          keyword: [`maxLength`, `minLength`],
          type: `string`,
          schemaType: `number`,
          $data: !0,
          error: {
            message({ keyword: e, schemaCode: n }) {
              let r = e === `maxLength` ? `more` : `fewer`;
              return (0, t.str)`must NOT have ${r} than ${n} characters`;
            },
            params: ({ schemaCode: e }) => (0, t._)`{limit: ${e}}`,
          },
          code(e) {
            let { keyword: r, data: i, schemaCode: o, it: s } = e,
              c = r === `maxLength` ? t.operators.GT : t.operators.LT,
              l =
                s.opts.unicode === !1
                  ? (0, t._)`${i}.length`
                  : (0, t._)`${(0, n.useFunc)(e.gen, a.default)}(${i})`;
            e.fail$data((0, t._)`${l} ${c} ${o}`);
          },
        };
      }),
      F = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = f(),
          n = i(),
          a = r();
        e.default = {
          keyword: `pattern`,
          type: `string`,
          schemaType: `string`,
          $data: !0,
          error: {
            message: ({ schemaCode: e }) => (0, a.str)`must match pattern "${e}"`,
            params: ({ schemaCode: e }) => (0, a._)`{pattern: ${e}}`,
          },
          code(e) {
            let { gen: r, data: i, $data: o, schema: s, schemaCode: c, it: l } = e,
              u = l.opts.unicodeRegExp ? `u` : ``;
            if (o) {
              let { regExp: t } = l.opts.code,
                o = t.code === `new RegExp` ? (0, a._)`new RegExp` : (0, n.useFunc)(r, t),
                s = r.let(`valid`);
              (r.try(
                () => r.assign(s, (0, a._)`${o}(${c}, ${u}).test(${i})`),
                () => r.assign(s, !1),
              ),
                e.fail$data((0, a._)`!${s}`));
            } else {
              let n = (0, t.usePattern)(e, s);
              e.fail$data((0, a._)`!${n}.test(${i})`);
            }
          },
        };
      }),
      I = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r();
        e.default = {
          keyword: [`maxProperties`, `minProperties`],
          type: `object`,
          schemaType: `number`,
          $data: !0,
          error: {
            message({ keyword: e, schemaCode: n }) {
              let r = e === `maxProperties` ? `more` : `fewer`;
              return (0, t.str)`must NOT have ${r} than ${n} properties`;
            },
            params: ({ schemaCode: e }) => (0, t._)`{limit: ${e}}`,
          },
          code(e) {
            let { keyword: n, data: r, schemaCode: i } = e,
              a = n === `maxProperties` ? t.operators.GT : t.operators.LT;
            e.fail$data((0, t._)`Object.keys(${r}).length ${a} ${i}`);
          },
        };
      }),
      L = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = f(),
          n = r(),
          a = i();
        e.default = {
          keyword: `required`,
          type: `object`,
          schemaType: `array`,
          $data: !0,
          error: {
            message: ({ params: { missingProperty: e } }) =>
              (0, n.str)`must have required property '${e}'`,
            params: ({ params: { missingProperty: e } }) => (0, n._)`{missingProperty: ${e}}`,
          },
          code(e) {
            let { gen: r, schema: i, schemaCode: o, data: s, $data: c, it: l } = e,
              { opts: u } = l;
            if (!c && i.length === 0) return;
            let d = i.length >= u.loopRequired;
            if ((l.allErrors ? f() : p(), u.strictRequired)) {
              let t = e.parentSchema.properties,
                { definedProperties: n } = e.it;
              for (let e of i)
                if (t?.[e] === void 0 && !n.has(e)) {
                  let t = `required property "${e}" is not defined at "${l.schemaEnv.baseId + l.errSchemaPath}" (strictRequired)`;
                  (0, a.checkStrictMode)(l, t, l.opts.strictRequired);
                }
            }
            function f() {
              if (d || c) e.block$data(n.nil, m);
              else for (let n of i) (0, t.checkReportMissingProp)(e, n);
            }
            function p() {
              let n = r.let(`missing`);
              if (d || c) {
                let t = r.let(`valid`, !0);
                (e.block$data(t, () => h(n, t)), e.ok(t));
              } else
                (r.if((0, t.checkMissingProp)(e, i, n)), (0, t.reportMissingProp)(e, n), r.else());
            }
            function m() {
              r.forOf(`prop`, o, (n) => {
                (e.setParams({ missingProperty: n }),
                  r.if((0, t.noPropertyInData)(r, s, n, u.ownProperties), () => e.error()));
              });
            }
            function h(i, a) {
              (e.setParams({ missingProperty: i }),
                r.forOf(
                  i,
                  o,
                  () => {
                    (r.assign(a, (0, t.propertyInData)(r, s, i, u.ownProperties)),
                      r.if((0, n.not)(a), () => {
                        (e.error(), r.break());
                      }));
                  },
                  n.nil,
                ));
            }
          },
        };
      }),
      R = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r();
        e.default = {
          keyword: [`maxItems`, `minItems`],
          type: `array`,
          schemaType: `number`,
          $data: !0,
          error: {
            message({ keyword: e, schemaCode: n }) {
              let r = e === `maxItems` ? `more` : `fewer`;
              return (0, t.str)`must NOT have ${r} than ${n} items`;
            },
            params: ({ schemaCode: e }) => (0, t._)`{limit: ${e}}`,
          },
          code(e) {
            let { keyword: n, data: r, schemaCode: i } = e,
              a = n === `maxItems` ? t.operators.GT : t.operators.LT;
            e.fail$data((0, t._)`${r}.length ${a} ${i}`);
          },
        };
      }),
      z = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = h();
        ((t.code = `require("ajv/dist/runtime/equal").default`), (e.default = t));
      }),
      B = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = u(),
          n = r(),
          a = i(),
          o = z();
        e.default = {
          keyword: `uniqueItems`,
          type: `array`,
          schemaType: `boolean`,
          $data: !0,
          error: {
            message: ({ params: { i: e, j: t } }) =>
              (0, n.str)`must NOT have duplicate items (items ## ${t} and ${e} are identical)`,
            params: ({ params: { i: e, j: t } }) => (0, n._)`{i: ${e}, j: ${t}}`,
          },
          code(e) {
            let { gen: r, data: i, $data: s, schema: c, parentSchema: l, schemaCode: u, it: d } = e;
            if (!s && !c) return;
            let f = r.let(`valid`),
              p = l.items ? (0, t.getSchemaTypes)(l.items) : [];
            (e.block$data(f, m, (0, n._)`${u} === false`), e.ok(f));
            function m() {
              let t = r.let(`i`, (0, n._)`${i}.length`),
                a = r.let(`j`);
              (e.setParams({ i: t, j: a }),
                r.assign(f, !0),
                r.if((0, n._)`${t} > 1`, () => (h() ? g : _)(t, a)));
            }
            function h() {
              return p.length > 0 && !p.some((e) => e === `object` || e === `array`);
            }
            function g(a, o) {
              let s = r.name(`item`),
                c = (0, t.checkDataTypes)(p, s, d.opts.strictNumbers, t.DataType.Wrong),
                l = r.const(`indices`, (0, n._)`{}`);
              r.for((0, n._)`;${a}--;`, () => {
                (r.let(s, (0, n._)`${i}[${a}]`),
                  r.if(c, (0, n._)`continue`),
                  p.length > 1 && r.if((0, n._)`typeof ${s} == "string"`, (0, n._)`${s} += "_"`),
                  r
                    .if((0, n._)`typeof ${l}[${s}] == "number"`, () => {
                      (r.assign(o, (0, n._)`${l}[${s}]`), e.error(), r.assign(f, !1).break());
                    })
                    .code((0, n._)`${l}[${s}] = ${a}`));
              });
            }
            function _(t, s) {
              let c = (0, a.useFunc)(r, o.default),
                l = r.name(`outer`);
              r.label(l).for((0, n._)`;${t}--;`, () =>
                r.for((0, n._)`${s} = ${t}; ${s}--;`, () =>
                  r.if((0, n._)`${c}(${i}[${t}], ${i}[${s}])`, () => {
                    (e.error(), r.assign(f, !1).break(l));
                  }),
                ),
              );
            }
          },
        };
      }),
      V = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i(),
          a = z();
        e.default = {
          keyword: `const`,
          $data: !0,
          error: {
            message: `must be equal to constant`,
            params: ({ schemaCode: e }) => (0, t._)`{allowedValue: ${e}}`,
          },
          code(e) {
            let { gen: r, data: i, $data: o, schemaCode: s, schema: c } = e;
            o || (c && typeof c == `object`)
              ? e.fail$data((0, t._)`!${(0, n.useFunc)(r, a.default)}(${i}, ${s})`)
              : e.fail((0, t._)`${c} !== ${i}`);
          },
        };
      }),
      H = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i(),
          a = z();
        e.default = {
          keyword: `enum`,
          schemaType: `array`,
          $data: !0,
          error: {
            message: `must be equal to one of the allowed values`,
            params: ({ schemaCode: e }) => (0, t._)`{allowedValues: ${e}}`,
          },
          code(e) {
            let { gen: r, data: i, $data: o, schema: s, schemaCode: c, it: l } = e;
            if (!o && s.length === 0) throw Error(`enum must have non-empty array`);
            let u = s.length >= l.opts.loopEnum,
              d,
              f = () => (d ??= (0, n.useFunc)(r, a.default)),
              p;
            if (u || o) ((p = r.let(`valid`)), e.block$data(p, m));
            else {
              /* istanbul ignore if */
              if (!Array.isArray(s)) throw Error(`ajv implementation error`);
              let e = r.const(`vSchema`, c);
              p = (0, t.or)(...s.map((t, n) => h(e, n)));
            }
            e.pass(p);
            function m() {
              (r.assign(p, !1),
                r.forOf(`v`, c, (e) =>
                  r.if((0, t._)`${f()}(${i}, ${e})`, () => r.assign(p, !0).break()),
                ));
            }
            function h(e, n) {
              let r = s[n];
              return typeof r == `object` && r
                ? (0, t._)`${f()}(${i}, ${e}[${n}])`
                : (0, t._)`${i} === ${r}`;
            }
          },
        };
      }),
      U = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = j(),
          n = M(),
          r = P(),
          i = F(),
          a = I(),
          o = L(),
          s = R(),
          c = B(),
          l = V(),
          u = H();
        e.default = [
          t.default,
          n.default,
          r.default,
          i.default,
          a.default,
          o.default,
          s.default,
          c.default,
          { keyword: `type`, schemaType: [`string`, `array`] },
          { keyword: `nullable`, schemaType: `boolean` },
          l.default,
          u.default,
        ];
      }),
      W = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.validateAdditionalItems = void 0));
        let t = r(),
          n = i(),
          a = {
            keyword: `additionalItems`,
            type: `array`,
            schemaType: [`boolean`, `object`],
            before: `uniqueItems`,
            error: {
              message: ({ params: { len: e } }) => (0, t.str)`must NOT have more than ${e} items`,
              params: ({ params: { len: e } }) => (0, t._)`{limit: ${e}}`,
            },
            code(e) {
              let { parentSchema: t, it: r } = e,
                { items: i } = t;
              Array.isArray(i)
                ? o(e, i)
                : (0, n.checkStrictMode)(
                    r,
                    `"additionalItems" is ignored when "items" is not an array of schemas`,
                  );
            },
          };
        function o(e, r) {
          let { gen: i, schema: a, data: o, keyword: s, it: c } = e;
          c.items = !0;
          let l = i.const(`len`, (0, t._)`${o}.length`);
          if (a === !1) (e.setParams({ len: r.length }), e.pass((0, t._)`${l} <= ${r.length}`));
          else if (typeof a == `object` && !(0, n.alwaysValidSchema)(c, a)) {
            let n = i.var(`valid`, (0, t._)`${l} <= ${r.length}`);
            (i.if((0, t.not)(n), () => u(n)), e.ok(n));
          }
          function u(a) {
            i.forRange(`i`, r.length, l, (r) => {
              (e.subschema({ keyword: s, dataProp: r, dataPropType: n.Type.Num }, a),
                c.allErrors || i.if((0, t.not)(a), () => i.break()));
            });
          }
        }
        ((e.validateAdditionalItems = o), (e.default = a));
      }),
      G = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }), (e.validateTuple = void 0));
        let t = r(),
          n = i(),
          a = f(),
          o = {
            keyword: `items`,
            type: `array`,
            schemaType: [`object`, `array`, `boolean`],
            before: `uniqueItems`,
            code(e) {
              let { schema: t, it: r } = e;
              if (Array.isArray(t)) return s(e, `additionalItems`, t);
              ((r.items = !0), !(0, n.alwaysValidSchema)(r, t) && e.ok((0, a.validateArray)(e)));
            },
          };
        function s(e, r, i = e.schema) {
          let { gen: a, parentSchema: o, data: s, keyword: c, it: l } = e;
          (f(o),
            l.opts.unevaluated &&
              i.length &&
              l.items !== !0 &&
              (l.items = n.mergeEvaluated.items(a, i.length, l.items)));
          let u = a.name(`valid`),
            d = a.const(`len`, (0, t._)`${s}.length`);
          i.forEach((r, i) => {
            (0, n.alwaysValidSchema)(l, r) ||
              (a.if((0, t._)`${d} > ${i}`, () =>
                e.subschema({ keyword: c, schemaProp: i, dataProp: i }, u),
              ),
              e.ok(u));
          });
          function f(e) {
            let { opts: t, errSchemaPath: a } = l,
              o = i.length,
              s = o === e.minItems && (o === e.maxItems || e[r] === !1);
            if (t.strictTuples && !s) {
              let e = `"${c}" is ${o}-tuple, but minItems or maxItems/${r} are not specified or different at path "${a}"`;
              (0, n.checkStrictMode)(l, e, t.strictTuples);
            }
          }
        }
        ((e.validateTuple = s), (e.default = o));
      }),
      ee = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = G();
        e.default = {
          keyword: `prefixItems`,
          type: `array`,
          schemaType: [`array`],
          before: `uniqueItems`,
          code: (e) => (0, t.validateTuple)(e, `items`),
        };
      }),
      te = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i(),
          a = f(),
          o = W();
        e.default = {
          keyword: `items`,
          type: `array`,
          schemaType: [`object`, `boolean`],
          before: `uniqueItems`,
          error: {
            message: ({ params: { len: e } }) => (0, t.str)`must NOT have more than ${e} items`,
            params: ({ params: { len: e } }) => (0, t._)`{limit: ${e}}`,
          },
          code(e) {
            let { schema: t, parentSchema: r, it: i } = e,
              { prefixItems: s } = r;
            ((i.items = !0),
              !(0, n.alwaysValidSchema)(i, t) &&
                (s ? (0, o.validateAdditionalItems)(e, s) : e.ok((0, a.validateArray)(e))));
          },
        };
      }),
      K = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i();
        e.default = {
          keyword: `contains`,
          type: `array`,
          schemaType: [`object`, `boolean`],
          before: `uniqueItems`,
          trackErrors: !0,
          error: {
            message: ({ params: { min: e, max: n } }) =>
              n === void 0
                ? (0, t.str)`must contain at least ${e} valid item(s)`
                : (0, t.str)`must contain at least ${e} and no more than ${n} valid item(s)`,
            params: ({ params: { min: e, max: n } }) =>
              n === void 0
                ? (0, t._)`{minContains: ${e}}`
                : (0, t._)`{minContains: ${e}, maxContains: ${n}}`,
          },
          code(e) {
            let { gen: r, schema: i, parentSchema: a, data: o, it: s } = e,
              c,
              l,
              { minContains: u, maxContains: d } = a;
            s.opts.next ? ((c = u === void 0 ? 1 : u), (l = d)) : (c = 1);
            let f = r.const(`len`, (0, t._)`${o}.length`);
            if ((e.setParams({ min: c, max: l }), l === void 0 && c === 0)) {
              (0, n.checkStrictMode)(
                s,
                `"minContains" == 0 without "maxContains": "contains" keyword ignored`,
              );
              return;
            }
            if (l !== void 0 && c > l) {
              ((0, n.checkStrictMode)(s, `"minContains" > "maxContains" is always invalid`),
                e.fail());
              return;
            }
            if ((0, n.alwaysValidSchema)(s, i)) {
              let n = (0, t._)`${f} >= ${c}`;
              (l !== void 0 && (n = (0, t._)`${n} && ${f} <= ${l}`), e.pass(n));
              return;
            }
            s.items = !0;
            let p = r.name(`valid`);
            (l === void 0 && c === 1
              ? h(p, () => r.if(p, () => r.break()))
              : c === 0
                ? (r.let(p, !0), l !== void 0 && r.if((0, t._)`${o}.length > 0`, m))
                : (r.let(p, !1), m()),
              e.result(p, () => e.reset()));
            function m() {
              let e = r.name(`_valid`),
                t = r.let(`count`, 0);
              h(e, () => r.if(e, () => g(t)));
            }
            function h(t, i) {
              r.forRange(`i`, 0, f, (r) => {
                (e.subschema(
                  { keyword: `contains`, dataProp: r, dataPropType: n.Type.Num, compositeRule: !0 },
                  t,
                ),
                  i());
              });
            }
            function g(e) {
              (r.code((0, t._)`${e}++`),
                l === void 0
                  ? r.if((0, t._)`${e} >= ${c}`, () => r.assign(p, !0).break())
                  : (r.if((0, t._)`${e} > ${l}`, () => r.assign(p, !1).break()),
                    c === 1
                      ? r.assign(p, !0)
                      : r.if((0, t._)`${e} >= ${c}`, () => r.assign(p, !0))));
            }
          },
        };
      }),
      q = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.validateSchemaDeps = e.validatePropertyDeps = e.error = void 0));
        let t = r(),
          n = i(),
          a = f();
        e.error = {
          message: ({ params: { property: e, depsCount: n, deps: r } }) => {
            let i = n === 1 ? `property` : `properties`;
            return (0, t.str)`must have ${i} ${r} when property ${e} is present`;
          },
          params: ({ params: { property: e, depsCount: n, deps: r, missingProperty: i } }) => (0,
          t._)`{property: ${e},
    missingProperty: ${i},
    depsCount: ${n},
    deps: ${r}}`,
        };
        let o = {
          keyword: `dependencies`,
          type: `object`,
          schemaType: `object`,
          error: e.error,
          code(e) {
            let [t, n] = s(e);
            (c(e, t), l(e, n));
          },
        };
        function s({ schema: e }) {
          let t = {},
            n = {};
          for (let r in e) {
            if (r === `__proto__`) continue;
            let i = Array.isArray(e[r]) ? t : n;
            i[r] = e[r];
          }
          return [t, n];
        }
        function c(e, n = e.schema) {
          let { gen: r, data: i, it: o } = e;
          if (Object.keys(n).length === 0) return;
          let s = r.let(`missing`);
          for (let c in n) {
            let l = n[c];
            if (l.length === 0) continue;
            let u = (0, a.propertyInData)(r, i, c, o.opts.ownProperties);
            (e.setParams({ property: c, depsCount: l.length, deps: l.join(`, `) }),
              o.allErrors
                ? r.if(u, () => {
                    for (let t of l) (0, a.checkReportMissingProp)(e, t);
                  })
                : (r.if((0, t._)`${u} && (${(0, a.checkMissingProp)(e, l, s)})`),
                  (0, a.reportMissingProp)(e, s),
                  r.else()));
          }
        }
        e.validatePropertyDeps = c;
        function l(e, t = e.schema) {
          let { gen: r, data: i, keyword: o, it: s } = e,
            c = r.name(`valid`);
          for (let l in t)
            (0, n.alwaysValidSchema)(s, t[l]) ||
              (r.if(
                (0, a.propertyInData)(r, i, l, s.opts.ownProperties),
                () => {
                  let t = e.subschema({ keyword: o, schemaProp: l }, c);
                  e.mergeValidEvaluated(t, c);
                },
                () => r.var(c, !0),
              ),
              e.ok(c));
        }
        ((e.validateSchemaDeps = l), (e.default = o));
      }),
      J = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i();
        e.default = {
          keyword: `propertyNames`,
          type: `object`,
          schemaType: [`object`, `boolean`],
          error: {
            message: `property name must be valid`,
            params: ({ params: e }) => (0, t._)`{propertyName: ${e.propertyName}}`,
          },
          code(e) {
            let { gen: r, schema: i, data: a, it: o } = e;
            if ((0, n.alwaysValidSchema)(o, i)) return;
            let s = r.name(`valid`);
            (r.forIn(`key`, a, (n) => {
              (e.setParams({ propertyName: n }),
                e.subschema(
                  {
                    keyword: `propertyNames`,
                    data: n,
                    dataTypes: [`string`],
                    propertyName: n,
                    compositeRule: !0,
                  },
                  s,
                ),
                r.if((0, t.not)(s), () => {
                  (e.error(!0), o.allErrors || r.break());
                }));
            }),
              e.ok(s));
          },
        };
      }),
      Y = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = f(),
          n = r(),
          o = a(),
          s = i();
        e.default = {
          keyword: `additionalProperties`,
          type: [`object`],
          schemaType: [`boolean`, `object`],
          allowUndefined: !0,
          trackErrors: !0,
          error: {
            message: `must NOT have additional properties`,
            params: ({ params: e }) => (0, n._)`{additionalProperty: ${e.additionalProperty}}`,
          },
          code(e) {
            let { gen: r, schema: i, parentSchema: a, data: c, errsCount: l, it: u } = e;
            /* istanbul ignore if */
            if (!l) throw Error(`ajv implementation error`);
            let { allErrors: d, opts: f } = u;
            if (((u.props = !0), f.removeAdditional !== `all` && (0, s.alwaysValidSchema)(u, i)))
              return;
            let p = (0, t.allSchemaProperties)(a.properties),
              m = (0, t.allSchemaProperties)(a.patternProperties);
            (h(), e.ok((0, n._)`${l} === ${o.default.errors}`));
            function h() {
              r.forIn(`key`, c, (e) => {
                !p.length && !m.length ? v(e) : r.if(g(e), () => v(e));
              });
            }
            function g(i) {
              let o;
              if (p.length > 8) {
                let e = (0, s.schemaRefOrVal)(u, a.properties, `properties`);
                o = (0, t.isOwnProperty)(r, e, i);
              } else o = p.length ? (0, n.or)(...p.map((e) => (0, n._)`${i} === ${e}`)) : n.nil;
              return (
                m.length &&
                  (o = (0, n.or)(
                    o,
                    ...m.map((r) => (0, n._)`${(0, t.usePattern)(e, r)}.test(${i})`),
                  )),
                (0, n.not)(o)
              );
            }
            function _(e) {
              r.code((0, n._)`delete ${c}[${e}]`);
            }
            function v(t) {
              if (f.removeAdditional === `all` || (f.removeAdditional && i === !1)) _(t);
              else if (i === !1)
                (e.setParams({ additionalProperty: t }), e.error(), d || r.break());
              else if (typeof i == `object` && !(0, s.alwaysValidSchema)(u, i)) {
                let i = r.name(`valid`);
                f.removeAdditional === `failing`
                  ? (y(t, i, !1),
                    r.if((0, n.not)(i), () => {
                      (e.reset(), _(t));
                    }))
                  : (y(t, i), d || r.if((0, n.not)(i), () => r.break()));
              }
            }
            function y(t, n, r) {
              let i = { keyword: `additionalProperties`, dataProp: t, dataPropType: s.Type.Str };
              (r === !1 && Object.assign(i, { compositeRule: !0, createErrors: !1, allErrors: !1 }),
                e.subschema(i, n));
            }
          },
        };
      }),
      ne = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = v(),
          n = f(),
          r = i(),
          a = Y();
        e.default = {
          keyword: `properties`,
          type: `object`,
          schemaType: `object`,
          code(e) {
            let { gen: i, schema: o, parentSchema: s, data: c, it: l } = e;
            l.opts.removeAdditional === `all` &&
              s.additionalProperties === void 0 &&
              a.default.code(new t.KeywordCxt(l, a.default, `additionalProperties`));
            let u = (0, n.allSchemaProperties)(o);
            for (let e of u) l.definedProperties.add(e);
            l.opts.unevaluated &&
              u.length &&
              l.props !== !0 &&
              (l.props = r.mergeEvaluated.props(i, (0, r.toHash)(u), l.props));
            let d = u.filter((e) => !(0, r.alwaysValidSchema)(l, o[e]));
            if (d.length === 0) return;
            let f = i.name(`valid`);
            for (let t of d)
              (p(t)
                ? m(t)
                : (i.if((0, n.propertyInData)(i, c, t, l.opts.ownProperties)),
                  m(t),
                  l.allErrors || i.else().var(f, !0),
                  i.endIf()),
                e.it.definedProperties.add(t),
                e.ok(f));
            function p(e) {
              return l.opts.useDefaults && !l.compositeRule && o[e].default !== void 0;
            }
            function m(t) {
              e.subschema({ keyword: `properties`, schemaProp: t, dataProp: t }, f);
            }
          },
        };
      }),
      X = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = f(),
          n = r(),
          a = i(),
          o = i();
        e.default = {
          keyword: `patternProperties`,
          type: `object`,
          schemaType: `object`,
          code(e) {
            let { gen: r, schema: i, data: s, parentSchema: c, it: l } = e,
              { opts: u } = l,
              d = (0, t.allSchemaProperties)(i),
              f = d.filter((e) => (0, a.alwaysValidSchema)(l, i[e]));
            if (
              d.length === 0 ||
              (f.length === d.length && (!l.opts.unevaluated || l.props === !0))
            )
              return;
            let p = u.strictSchema && !u.allowMatchingProperties && c.properties,
              m = r.name(`valid`);
            l.props !== !0 &&
              !(l.props instanceof n.Name) &&
              (l.props = (0, o.evaluatedPropsToName)(r, l.props));
            let { props: h } = l;
            g();
            function g() {
              for (let e of d) (p && _(e), l.allErrors ? v(e) : (r.var(m, !0), v(e), r.if(m)));
            }
            function _(e) {
              for (let t in p)
                new RegExp(e).test(t) &&
                  (0, a.checkStrictMode)(
                    l,
                    `property ${t} matches pattern ${e} (use allowMatchingProperties)`,
                  );
            }
            function v(i) {
              r.forIn(`key`, s, (a) => {
                r.if((0, n._)`${(0, t.usePattern)(e, i)}.test(${a})`, () => {
                  let t = f.includes(i);
                  (t ||
                    e.subschema(
                      {
                        keyword: `patternProperties`,
                        schemaProp: i,
                        dataProp: a,
                        dataPropType: o.Type.Str,
                      },
                      m,
                    ),
                    l.opts.unevaluated && h !== !0
                      ? r.assign((0, n._)`${h}[${a}]`, !0)
                      : !t && !l.allErrors && r.if((0, n.not)(m), () => r.break()));
                });
              });
            }
          },
        };
      }),
      Z = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = i();
        e.default = {
          keyword: `not`,
          schemaType: [`object`, `boolean`],
          trackErrors: !0,
          code(e) {
            let { gen: n, schema: r, it: i } = e;
            if ((0, t.alwaysValidSchema)(i, r)) {
              e.fail();
              return;
            }
            let a = n.name(`valid`);
            (e.subschema({ keyword: `not`, compositeRule: !0, createErrors: !1, allErrors: !1 }, a),
              e.failResult(
                a,
                () => e.reset(),
                () => e.error(),
              ));
          },
          error: { message: `must NOT be valid` },
        };
      }),
      Q = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.default = {
            keyword: `anyOf`,
            schemaType: `array`,
            trackErrors: !0,
            code: f().validateUnion,
            error: { message: `must match a schema in anyOf` },
          }));
      }),
      re = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i();
        e.default = {
          keyword: `oneOf`,
          schemaType: `array`,
          trackErrors: !0,
          error: {
            message: `must match exactly one schema in oneOf`,
            params: ({ params: e }) => (0, t._)`{passingSchemas: ${e.passing}}`,
          },
          code(e) {
            let { gen: r, schema: i, parentSchema: a, it: o } = e;
            /* istanbul ignore if */
            if (!Array.isArray(i)) throw Error(`ajv implementation error`);
            if (o.opts.discriminator && a.discriminator) return;
            let s = i,
              c = r.let(`valid`, !1),
              l = r.let(`passing`, null),
              u = r.name(`_valid`);
            (e.setParams({ passing: l }),
              r.block(d),
              e.result(
                c,
                () => e.reset(),
                () => e.error(!0),
              ));
            function d() {
              s.forEach((i, a) => {
                let s;
                ((0, n.alwaysValidSchema)(o, i)
                  ? r.var(u, !0)
                  : (s = e.subschema({ keyword: `oneOf`, schemaProp: a, compositeRule: !0 }, u)),
                  a > 0 &&
                    r
                      .if((0, t._)`${u} && ${c}`)
                      .assign(c, !1)
                      .assign(l, (0, t._)`[${l}, ${a}]`)
                      .else(),
                  r.if(u, () => {
                    (r.assign(c, !0), r.assign(l, a), s && e.mergeEvaluated(s, t.Name));
                  }));
              });
            }
          },
        };
      }),
      ie = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = i();
        e.default = {
          keyword: `allOf`,
          schemaType: `array`,
          code(e) {
            let { gen: n, schema: r, it: i } = e;
            /* istanbul ignore if */
            if (!Array.isArray(r)) throw Error(`ajv implementation error`);
            let a = n.name(`valid`);
            r.forEach((n, r) => {
              if ((0, t.alwaysValidSchema)(i, n)) return;
              let o = e.subschema({ keyword: `allOf`, schemaProp: r }, a);
              (e.ok(a), e.mergeEvaluated(o));
            });
          },
        };
      }),
      $ = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i(),
          a = {
            keyword: `if`,
            schemaType: [`object`, `boolean`],
            trackErrors: !0,
            error: {
              message: ({ params: e }) => (0, t.str)`must match "${e.ifClause}" schema`,
              params: ({ params: e }) => (0, t._)`{failingKeyword: ${e.ifClause}}`,
            },
            code(e) {
              let { gen: r, parentSchema: i, it: a } = e;
              i.then === void 0 &&
                i.else === void 0 &&
                (0, n.checkStrictMode)(a, `"if" without "then" and "else" is ignored`);
              let s = o(a, `then`),
                c = o(a, `else`);
              if (!s && !c) return;
              let l = r.let(`valid`, !0),
                u = r.name(`_valid`);
              if ((d(), e.reset(), s && c)) {
                let t = r.let(`ifClause`);
                (e.setParams({ ifClause: t }), r.if(u, f(`then`, t), f(`else`, t)));
              } else s ? r.if(u, f(`then`)) : r.if((0, t.not)(u), f(`else`));
              e.pass(l, () => e.error(!0));
              function d() {
                let t = e.subschema(
                  { keyword: `if`, compositeRule: !0, createErrors: !1, allErrors: !1 },
                  u,
                );
                e.mergeEvaluated(t);
              }
              function f(n, i) {
                return () => {
                  let a = e.subschema({ keyword: n }, u);
                  (r.assign(l, u),
                    e.mergeValidEvaluated(a, l),
                    i ? r.assign(i, (0, t._)`${n}`) : e.setParams({ ifClause: n }));
                };
              }
            },
          };
        function o(e, t) {
          let r = e.schema[t];
          return r !== void 0 && !(0, n.alwaysValidSchema)(e, r);
        }
        e.default = a;
      }),
      ae = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = i();
        e.default = {
          keyword: [`then`, `else`],
          schemaType: [`object`, `boolean`],
          code({ keyword: e, parentSchema: n, it: r }) {
            n.if === void 0 && (0, t.checkStrictMode)(r, `"${e}" without "if" is ignored`);
          },
        };
      }),
      oe = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = W(),
          n = ee(),
          r = G(),
          i = te(),
          a = K(),
          o = q(),
          s = J(),
          c = Y(),
          l = ne(),
          u = X(),
          d = Z(),
          f = Q(),
          p = re(),
          m = ie(),
          h = $(),
          g = ae();
        function _(e = !1) {
          let _ = [
            d.default,
            f.default,
            p.default,
            m.default,
            h.default,
            g.default,
            s.default,
            c.default,
            o.default,
            l.default,
            u.default,
          ];
          return (
            e ? _.push(n.default, i.default) : _.push(t.default, r.default),
            _.push(a.default),
            _
          );
        }
        e.default = _;
      }),
      se = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }), (e.dynamicAnchor = void 0));
        let t = r(),
          n = a(),
          i = x(),
          o = k(),
          s = { keyword: `$dynamicAnchor`, schemaType: `string`, code: (e) => c(e, e.schema) };
        function c(e, r) {
          let { gen: i, it: a } = e;
          a.schemaEnv.root.dynamicAnchors[r] = !0;
          let o = (0, t._)`${n.default.dynamicAnchors}${(0, t.getProperty)(r)}`,
            s = a.errSchemaPath === `#` ? a.validateName : l(e);
          i.if((0, t._)`!${o}`, () => i.assign(o, s));
        }
        e.dynamicAnchor = c;
        function l(e) {
          let { schemaEnv: t, schema: n, self: r } = e.it,
            { root: a, baseId: s, localRefs: c, meta: l } = t.root,
            { schemaId: u } = r.opts,
            d = new i.SchemaEnv({
              schema: n,
              schemaId: u,
              root: a,
              baseId: s,
              localRefs: c,
              meta: l,
            });
          return (i.compileSchema.call(r, d), (0, o.getValidate)(e, d));
        }
        e.default = s;
      }),
      ce = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }), (e.dynamicRef = void 0));
        let t = r(),
          n = a(),
          i = k(),
          o = { keyword: `$dynamicRef`, schemaType: `string`, code: (e) => s(e, e.schema) };
        function s(e, r) {
          let { gen: a, keyword: o, it: s } = e;
          if (r[0] !== `#`) throw Error(`"${o}" only supports hash fragment reference`);
          let c = r.slice(1);
          if (s.allErrors) l();
          else {
            let t = a.let(`valid`, !1);
            (l(t), e.ok(t));
          }
          function l(e) {
            if (s.schemaEnv.root.dynamicAnchors[c]) {
              let r = a.let(`_v`, (0, t._)`${n.default.dynamicAnchors}${(0, t.getProperty)(c)}`);
              a.if(r, u(r, e), u(s.validateName, e));
            } else u(s.validateName, e)();
          }
          function u(t, n) {
            return n
              ? () =>
                  a.block(() => {
                    ((0, i.callRef)(e, t), a.let(n, !0));
                  })
              : () => (0, i.callRef)(e, t);
          }
        }
        ((e.dynamicRef = s), (e.default = o));
      }),
      le = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = se(),
          n = i();
        e.default = {
          keyword: `$recursiveAnchor`,
          schemaType: `boolean`,
          code(e) {
            e.schema
              ? (0, t.dynamicAnchor)(e, ``)
              : (0, n.checkStrictMode)(e.it, `$recursiveAnchor: false is ignored`);
          },
        };
      }),
      ue = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = ce();
        e.default = {
          keyword: `$recursiveRef`,
          schemaType: `string`,
          code: (e) => (0, t.dynamicRef)(e, e.schema),
        };
      }),
      de = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = se(),
          n = ce(),
          r = le(),
          i = ue();
        e.default = [t.default, n.default, r.default, i.default];
      }),
      fe = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = q();
        e.default = {
          keyword: `dependentRequired`,
          type: `object`,
          schemaType: `object`,
          error: t.error,
          code: (e) => (0, t.validatePropertyDeps)(e),
        };
      }),
      pe = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = q();
        e.default = {
          keyword: `dependentSchemas`,
          type: `object`,
          schemaType: `object`,
          code: (e) => (0, t.validateSchemaDeps)(e),
        };
      }),
      me = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = i();
        e.default = {
          keyword: [`maxContains`, `minContains`],
          type: `array`,
          schemaType: `number`,
          code({ keyword: e, parentSchema: n, it: r }) {
            n.contains === void 0 &&
              (0, t.checkStrictMode)(r, `"${e}" without "contains" is ignored`);
          },
        };
      }),
      he = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = fe(),
          n = pe(),
          r = me();
        e.default = [t.default, n.default, r.default];
      }),
      ge = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i(),
          o = a();
        e.default = {
          keyword: `unevaluatedProperties`,
          type: `object`,
          schemaType: [`boolean`, `object`],
          trackErrors: !0,
          error: {
            message: `must NOT have unevaluated properties`,
            params: ({ params: e }) => (0, t._)`{unevaluatedProperty: ${e.unevaluatedProperty}}`,
          },
          code(e) {
            let { gen: r, schema: i, data: a, errsCount: s, it: c } = e;
            /* istanbul ignore if */
            if (!s) throw Error(`ajv implementation error`);
            let { allErrors: l, props: u } = c;
            (u instanceof t.Name
              ? r.if((0, t._)`${u} !== true`, () =>
                  r.forIn(`key`, a, (e) => r.if(f(u, e), () => d(e))),
                )
              : u !== !0 &&
                r.forIn(`key`, a, (e) => (u === void 0 ? d(e) : r.if(p(u, e), () => d(e)))),
              (c.props = !0),
              e.ok((0, t._)`${s} === ${o.default.errors}`));
            function d(a) {
              if (i === !1) (e.setParams({ unevaluatedProperty: a }), e.error(), l || r.break());
              else if (!(0, n.alwaysValidSchema)(c, i)) {
                let i = r.name(`valid`);
                (e.subschema(
                  { keyword: `unevaluatedProperties`, dataProp: a, dataPropType: n.Type.Str },
                  i,
                ),
                  l || r.if((0, t.not)(i), () => r.break()));
              }
            }
            function f(e, n) {
              return (0, t._)`!${e} || !${e}[${n}]`;
            }
            function p(e, n) {
              let r = [];
              for (let i in e) e[i] === !0 && r.push((0, t._)`${n} !== ${i}`);
              return (0, t.and)(...r);
            }
          },
        };
      }),
      _e = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = i();
        e.default = {
          keyword: `unevaluatedItems`,
          type: `array`,
          schemaType: [`boolean`, `object`],
          error: {
            message: ({ params: { len: e } }) => (0, t.str)`must NOT have more than ${e} items`,
            params: ({ params: { len: e } }) => (0, t._)`{limit: ${e}}`,
          },
          code(e) {
            let { gen: r, schema: i, data: a, it: o } = e,
              s = o.items || 0;
            if (s === !0) return;
            let c = r.const(`len`, (0, t._)`${a}.length`);
            if (i === !1) (e.setParams({ len: s }), e.fail((0, t._)`${c} > ${s}`));
            else if (typeof i == `object` && !(0, n.alwaysValidSchema)(o, i)) {
              let n = r.var(`valid`, (0, t._)`${c} <= ${s}`);
              (r.if((0, t.not)(n), () => l(n, s)), e.ok(n));
            }
            o.items = !0;
            function l(i, a) {
              r.forRange(`i`, a, c, (a) => {
                (e.subschema(
                  { keyword: `unevaluatedItems`, dataProp: a, dataPropType: n.Type.Num },
                  i,
                ),
                  o.allErrors || r.if((0, t.not)(i), () => r.break()));
              });
            }
          },
        };
      }),
      ve = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = ge(),
          n = _e();
        e.default = [t.default, n.default];
      }),
      ye = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r();
        e.default = {
          keyword: `format`,
          type: [`number`, `string`],
          schemaType: `string`,
          $data: !0,
          error: {
            message: ({ schemaCode: e }) => (0, t.str)`must match format "${e}"`,
            params: ({ schemaCode: e }) => (0, t._)`{format: ${e}}`,
          },
          code(e, n) {
            let { gen: r, data: i, $data: a, schema: o, schemaCode: s, it: c } = e,
              { opts: l, errSchemaPath: u, schemaEnv: d, self: f } = c;
            if (!l.validateFormats) return;
            a ? p() : m();
            function p() {
              let a = r.scopeValue(`formats`, { ref: f.formats, code: l.code.formats }),
                o = r.const(`fDef`, (0, t._)`${a}[${s}]`),
                c = r.let(`fType`),
                u = r.let(`format`);
              (r.if(
                (0, t._)`typeof ${o} == "object" && !(${o} instanceof RegExp)`,
                () =>
                  r.assign(c, (0, t._)`${o}.type || "string"`).assign(u, (0, t._)`${o}.validate`),
                () => r.assign(c, (0, t._)`"string"`).assign(u, o),
              ),
                e.fail$data((0, t.or)(p(), m())));
              function p() {
                return l.strictSchema === !1 ? t.nil : (0, t._)`${s} && !${u}`;
              }
              function m() {
                let e = d.$async
                    ? (0, t._)`(${o}.async ? await ${u}(${i}) : ${u}(${i}))`
                    : (0, t._)`${u}(${i})`,
                  r = (0, t._)`(typeof ${u} == "function" ? ${e} : ${u}.test(${i}))`;
                return (0, t._)`${u} && ${u} !== true && ${c} === ${n} && !${r}`;
              }
            }
            function m() {
              let a = f.formats[o];
              if (!a) {
                m();
                return;
              }
              if (a === !0) return;
              let [s, c, p] = h(a);
              s === n && e.pass(g());
              function m() {
                if (l.strictSchema === !1) {
                  f.logger.warn(e());
                  return;
                }
                throw Error(e());
                function e() {
                  return `unknown format "${o}" ignored in schema at path "${u}"`;
                }
              }
              function h(e) {
                let n =
                    e instanceof RegExp
                      ? (0, t.regexpCode)(e)
                      : l.code.formats
                        ? (0, t._)`${l.code.formats}${(0, t.getProperty)(o)}`
                        : void 0,
                  i = r.scopeValue(`formats`, { key: o, ref: e, code: n });
                return typeof e == `object` && !(e instanceof RegExp)
                  ? [e.type || `string`, e.validate, (0, t._)`${i}.validate`]
                  : [`string`, e, i];
              }
              function g() {
                if (typeof a == `object` && !(a instanceof RegExp) && a.async) {
                  if (!d.$async) throw Error(`async format in sync schema`);
                  return (0, t._)`await ${p}(${i})`;
                }
                return typeof c == `function` ? (0, t._)`${p}(${i})` : (0, t._)`${p}.test(${i})`;
              }
            }
          },
        };
      }),
      be = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }), (e.default = [ye().default]));
      }),
      xe = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }),
          (e.contentVocabulary = e.metadataVocabulary = void 0),
          (e.metadataVocabulary = [
            `title`,
            `description`,
            `default`,
            `deprecated`,
            `readOnly`,
            `writeOnly`,
            `examples`,
          ]),
          (e.contentVocabulary = [`contentMediaType`, `contentEncoding`, `contentSchema`]));
      }),
      Se = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = A(),
          n = U(),
          r = oe(),
          i = de(),
          a = he(),
          o = ve(),
          s = be(),
          c = xe();
        e.default = [
          i.default,
          t.default,
          n.default,
          (0, r.default)(!0),
          s.default,
          c.metadataVocabulary,
          c.contentVocabulary,
          a.default,
          o.default,
        ];
      }),
      Ce = /* @__PURE__ */ e((e) => {
        (Object.defineProperty(e, '__esModule', { value: !0 }), (e.DiscrError = void 0));
        var t;
        (function (e) {
          ((e.Tag = `tag`), (e.Mapping = `mapping`));
        })(t || (e.DiscrError = t = {}));
      }),
      we = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = r(),
          n = Ce(),
          a = x(),
          o = b(),
          s = i();
        e.default = {
          keyword: `discriminator`,
          type: `object`,
          schemaType: `object`,
          error: {
            message: ({ params: { discrError: e, tagName: t } }) =>
              e === n.DiscrError.Tag
                ? `tag "${t}" must be string`
                : `value of tag "${t}" must be in oneOf`,
            params: ({ params: { discrError: e, tag: n, tagName: r } }) =>
              (0, t._)`{error: ${e}, tag: ${r}, tagValue: ${n}}`,
          },
          code(e) {
            let { gen: r, data: i, schema: c, parentSchema: l, it: u } = e,
              { oneOf: d } = l;
            if (!u.opts.discriminator) throw Error(`discriminator: requires discriminator option`);
            let f = c.propertyName;
            if (typeof f != `string`) throw Error(`discriminator: requires propertyName`);
            if (c.mapping) throw Error(`discriminator: mapping is not supported`);
            if (!d) throw Error(`discriminator: requires oneOf keyword`);
            let p = r.let(`valid`, !1),
              m = r.const(`tag`, (0, t._)`${i}${(0, t.getProperty)(f)}`);
            (r.if(
              (0, t._)`typeof ${m} == "string"`,
              () => h(),
              () => e.error(!1, { discrError: n.DiscrError.Tag, tag: m, tagName: f }),
            ),
              e.ok(p));
            function h() {
              let i = _();
              r.if(!1);
              for (let e in i) (r.elseIf((0, t._)`${m} === ${e}`), r.assign(p, g(i[e])));
              (r.else(),
                e.error(!1, { discrError: n.DiscrError.Mapping, tag: m, tagName: f }),
                r.endIf());
            }
            function g(n) {
              let i = r.name(`valid`),
                a = e.subschema({ keyword: `oneOf`, schemaProp: n }, i);
              return (e.mergeEvaluated(a, t.Name), i);
            }
            function _() {
              let e = {},
                t = r(l),
                n = !0;
              for (let e = 0; e < d.length; e++) {
                let c = d[e];
                if (c?.$ref && !(0, s.schemaHasRulesButRef)(c, u.self.RULES)) {
                  let e = c.$ref;
                  if (
                    ((c = a.resolveRef.call(u.self, u.schemaEnv.root, u.baseId, e)),
                    c instanceof a.SchemaEnv && (c = c.schema),
                    c === void 0)
                  )
                    throw new o.default(u.opts.uriResolver, u.baseId, e);
                }
                let l = c?.properties?.[f];
                if (typeof l != `object`)
                  throw Error(
                    `discriminator: oneOf subschemas (or referenced schemas) must have "properties/${f}"`,
                  );
                ((n &&= t || r(c)), i(l, e));
              }
              if (!n) throw Error(`discriminator: "${f}" must be required`);
              return e;
              function r({ required: e }) {
                return Array.isArray(e) && e.includes(f);
              }
              function i(e, t) {
                if (e.const) c(e.const, t);
                else if (e.enum) for (let n of e.enum) c(n, t);
                else throw Error(`discriminator: "properties/${f}" must have "const" or "enum"`);
              }
              function c(t, n) {
                if (typeof t != `string` || t in e)
                  throw Error(`discriminator: "${f}" values must be unique strings`);
                e[t] = n;
              }
            }
          },
        };
      }),
      Te = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $schema: `https://json-schema.org/draft/2020-12/schema`,
          $id: `https://json-schema.org/draft/2020-12/schema`,
          $vocabulary: {
            'https://json-schema.org/draft/2020-12/vocab/core': !0,
            'https://json-schema.org/draft/2020-12/vocab/applicator': !0,
            'https://json-schema.org/draft/2020-12/vocab/unevaluated': !0,
            'https://json-schema.org/draft/2020-12/vocab/validation': !0,
            'https://json-schema.org/draft/2020-12/vocab/meta-data': !0,
            'https://json-schema.org/draft/2020-12/vocab/format-annotation': !0,
            'https://json-schema.org/draft/2020-12/vocab/content': !0,
          },
          $dynamicAnchor: `meta`,
          title: `Core and Validation specifications meta-schema`,
          allOf: [
            { $ref: `meta/core` },
            { $ref: `meta/applicator` },
            { $ref: `meta/unevaluated` },
            { $ref: `meta/validation` },
            { $ref: `meta/meta-data` },
            { $ref: `meta/format-annotation` },
            { $ref: `meta/content` },
          ],
          type: [`object`, `boolean`],
          $comment: `This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.`,
          properties: {
            definitions: {
              $comment: `"definitions" has been replaced by "$defs".`,
              type: `object`,
              additionalProperties: { $dynamicRef: `#meta` },
              deprecated: !0,
              default: {},
            },
            dependencies: {
              $comment: `"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.`,
              type: `object`,
              additionalProperties: {
                anyOf: [{ $dynamicRef: `#meta` }, { $ref: `meta/validation#/$defs/stringArray` }],
              },
              deprecated: !0,
              default: {},
            },
            $recursiveAnchor: {
              $comment: `"$recursiveAnchor" has been replaced by "$dynamicAnchor".`,
              $ref: `meta/core#/$defs/anchorString`,
              deprecated: !0,
            },
            $recursiveRef: {
              $comment: `"$recursiveRef" has been replaced by "$dynamicRef".`,
              $ref: `meta/core#/$defs/uriReferenceString`,
              deprecated: !0,
            },
          },
        };
      }),
      Ee = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $schema: `https://json-schema.org/draft/2020-12/schema`,
          $id: `https://json-schema.org/draft/2020-12/meta/applicator`,
          $vocabulary: { 'https://json-schema.org/draft/2020-12/vocab/applicator': !0 },
          $dynamicAnchor: `meta`,
          title: `Applicator vocabulary meta-schema`,
          type: [`object`, `boolean`],
          properties: {
            prefixItems: { $ref: `#/$defs/schemaArray` },
            items: { $dynamicRef: `#meta` },
            contains: { $dynamicRef: `#meta` },
            additionalProperties: { $dynamicRef: `#meta` },
            properties: {
              type: `object`,
              additionalProperties: { $dynamicRef: `#meta` },
              default: {},
            },
            patternProperties: {
              type: `object`,
              additionalProperties: { $dynamicRef: `#meta` },
              propertyNames: { format: `regex` },
              default: {},
            },
            dependentSchemas: {
              type: `object`,
              additionalProperties: { $dynamicRef: `#meta` },
              default: {},
            },
            propertyNames: { $dynamicRef: `#meta` },
            if: { $dynamicRef: `#meta` },
            then: { $dynamicRef: `#meta` },
            else: { $dynamicRef: `#meta` },
            allOf: { $ref: `#/$defs/schemaArray` },
            anyOf: { $ref: `#/$defs/schemaArray` },
            oneOf: { $ref: `#/$defs/schemaArray` },
            not: { $dynamicRef: `#meta` },
          },
          $defs: { schemaArray: { type: `array`, minItems: 1, items: { $dynamicRef: `#meta` } } },
        };
      }),
      De = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $schema: `https://json-schema.org/draft/2020-12/schema`,
          $id: `https://json-schema.org/draft/2020-12/meta/unevaluated`,
          $vocabulary: { 'https://json-schema.org/draft/2020-12/vocab/unevaluated': !0 },
          $dynamicAnchor: `meta`,
          title: `Unevaluated applicator vocabulary meta-schema`,
          type: [`object`, `boolean`],
          properties: {
            unevaluatedItems: { $dynamicRef: `#meta` },
            unevaluatedProperties: { $dynamicRef: `#meta` },
          },
        };
      }),
      Oe = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $schema: `https://json-schema.org/draft/2020-12/schema`,
          $id: `https://json-schema.org/draft/2020-12/meta/content`,
          $vocabulary: { 'https://json-schema.org/draft/2020-12/vocab/content': !0 },
          $dynamicAnchor: `meta`,
          title: `Content vocabulary meta-schema`,
          type: [`object`, `boolean`],
          properties: {
            contentEncoding: { type: `string` },
            contentMediaType: { type: `string` },
            contentSchema: { $dynamicRef: `#meta` },
          },
        };
      }),
      ke = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $schema: `https://json-schema.org/draft/2020-12/schema`,
          $id: `https://json-schema.org/draft/2020-12/meta/core`,
          $vocabulary: { 'https://json-schema.org/draft/2020-12/vocab/core': !0 },
          $dynamicAnchor: `meta`,
          title: `Core vocabulary meta-schema`,
          type: [`object`, `boolean`],
          properties: {
            $id: {
              $ref: `#/$defs/uriReferenceString`,
              $comment: `Non-empty fragments not allowed.`,
              pattern: `^[^#]*#?$`,
            },
            $schema: { $ref: `#/$defs/uriString` },
            $ref: { $ref: `#/$defs/uriReferenceString` },
            $anchor: { $ref: `#/$defs/anchorString` },
            $dynamicRef: { $ref: `#/$defs/uriReferenceString` },
            $dynamicAnchor: { $ref: `#/$defs/anchorString` },
            $vocabulary: {
              type: `object`,
              propertyNames: { $ref: `#/$defs/uriString` },
              additionalProperties: { type: `boolean` },
            },
            $comment: { type: `string` },
            $defs: { type: `object`, additionalProperties: { $dynamicRef: `#meta` } },
          },
          $defs: {
            anchorString: { type: `string`, pattern: `^[A-Za-z_][-A-Za-z0-9._]*$` },
            uriString: { type: `string`, format: `uri` },
            uriReferenceString: { type: `string`, format: `uri-reference` },
          },
        };
      }),
      Ae = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $schema: `https://json-schema.org/draft/2020-12/schema`,
          $id: `https://json-schema.org/draft/2020-12/meta/format-annotation`,
          $vocabulary: { 'https://json-schema.org/draft/2020-12/vocab/format-annotation': !0 },
          $dynamicAnchor: `meta`,
          title: `Format vocabulary meta-schema for annotation results`,
          type: [`object`, `boolean`],
          properties: { format: { type: `string` } },
        };
      }),
      je = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $schema: `https://json-schema.org/draft/2020-12/schema`,
          $id: `https://json-schema.org/draft/2020-12/meta/meta-data`,
          $vocabulary: { 'https://json-schema.org/draft/2020-12/vocab/meta-data': !0 },
          $dynamicAnchor: `meta`,
          title: `Meta-data vocabulary meta-schema`,
          type: [`object`, `boolean`],
          properties: {
            title: { type: `string` },
            description: { type: `string` },
            default: !0,
            deprecated: { type: `boolean`, default: !1 },
            readOnly: { type: `boolean`, default: !1 },
            writeOnly: { type: `boolean`, default: !1 },
            examples: { type: `array`, items: !0 },
          },
        };
      }),
      Me = /* @__PURE__ */ e((e, t) => {
        t.exports = {
          $schema: `https://json-schema.org/draft/2020-12/schema`,
          $id: `https://json-schema.org/draft/2020-12/meta/validation`,
          $vocabulary: { 'https://json-schema.org/draft/2020-12/vocab/validation': !0 },
          $dynamicAnchor: `meta`,
          title: `Validation vocabulary meta-schema`,
          type: [`object`, `boolean`],
          properties: {
            type: {
              anyOf: [
                { $ref: `#/$defs/simpleTypes` },
                {
                  type: `array`,
                  items: { $ref: `#/$defs/simpleTypes` },
                  minItems: 1,
                  uniqueItems: !0,
                },
              ],
            },
            const: !0,
            enum: { type: `array`, items: !0 },
            multipleOf: { type: `number`, exclusiveMinimum: 0 },
            maximum: { type: `number` },
            exclusiveMaximum: { type: `number` },
            minimum: { type: `number` },
            exclusiveMinimum: { type: `number` },
            maxLength: { $ref: `#/$defs/nonNegativeInteger` },
            minLength: { $ref: `#/$defs/nonNegativeIntegerDefault0` },
            pattern: { type: `string`, format: `regex` },
            maxItems: { $ref: `#/$defs/nonNegativeInteger` },
            minItems: { $ref: `#/$defs/nonNegativeIntegerDefault0` },
            uniqueItems: { type: `boolean`, default: !1 },
            maxContains: { $ref: `#/$defs/nonNegativeInteger` },
            minContains: { $ref: `#/$defs/nonNegativeInteger`, default: 1 },
            maxProperties: { $ref: `#/$defs/nonNegativeInteger` },
            minProperties: { $ref: `#/$defs/nonNegativeIntegerDefault0` },
            required: { $ref: `#/$defs/stringArray` },
            dependentRequired: {
              type: `object`,
              additionalProperties: { $ref: `#/$defs/stringArray` },
            },
          },
          $defs: {
            nonNegativeInteger: { type: `integer`, minimum: 0 },
            nonNegativeIntegerDefault0: { $ref: `#/$defs/nonNegativeInteger`, default: 0 },
            simpleTypes: {
              enum: [`array`, `boolean`, `integer`, `null`, `number`, `object`, `string`],
            },
            stringArray: { type: `array`, items: { type: `string` }, uniqueItems: !0, default: [] },
          },
        };
      }),
      Ne = /* @__PURE__ */ e((e) => {
        Object.defineProperty(e, '__esModule', { value: !0 });
        let t = Te(),
          n = Ee(),
          r = De(),
          i = Oe(),
          a = ke(),
          o = Ae(),
          s = je(),
          c = Me(),
          l = [`/properties`];
        function u(e) {
          return (
            [t, n, r, i, a, u(this, o), s, u(this, c)].forEach((e) =>
              this.addMetaSchema(e, void 0, !1),
            ),
            this
          );
          function u(t, n) {
            return e ? t.$dataMetaSchema(n, l) : n;
          }
        }
        e.default = u;
      });
    let Pe = /* @__PURE__ */ e((e, t) => {
      (Object.defineProperty(e, '__esModule', { value: !0 }),
        (e.MissingRefError =
          e.ValidationError =
          e.CodeGen =
          e.Name =
          e.nil =
          e.stringify =
          e.str =
          e._ =
          e.KeywordCxt =
          e.Ajv2020 =
            void 0));
      let n = D(),
        i = Se(),
        a = we(),
        o = Ne(),
        s = `https://json-schema.org/draft/2020-12/schema`;
      var c = class extends n.default {
        constructor(e = {}) {
          super({ ...e, dynamicRef: !0, next: !0, unevaluated: !0 });
        }
        _addVocabularies() {
          (super._addVocabularies(),
            i.default.forEach((e) => this.addVocabulary(e)),
            this.opts.discriminator && this.addKeyword(a.default));
        }
        _addDefaultMetaSchema() {
          super._addDefaultMetaSchema();
          let { $data: e, meta: t } = this.opts;
          t && (o.default.call(this, e), (this.refs[`http://json-schema.org/schema`] = s));
        }
        defaultMeta() {
          return (this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(s) ? s : void 0));
        }
      };
      ((e.Ajv2020 = c),
        (t.exports = e = c),
        (t.exports.Ajv2020 = c),
        Object.defineProperty(e, '__esModule', { value: !0 }),
        (e.default = c));
      var l = v();
      Object.defineProperty(e, 'KeywordCxt', {
        enumerable: !0,
        get: function () {
          return l.KeywordCxt;
        },
      });
      var u = r();
      (Object.defineProperty(e, '_', {
        enumerable: !0,
        get: function () {
          return u._;
        },
      }),
        Object.defineProperty(e, 'str', {
          enumerable: !0,
          get: function () {
            return u.str;
          },
        }),
        Object.defineProperty(e, 'stringify', {
          enumerable: !0,
          get: function () {
            return u.stringify;
          },
        }),
        Object.defineProperty(e, 'nil', {
          enumerable: !0,
          get: function () {
            return u.nil;
          },
        }),
        Object.defineProperty(e, 'Name', {
          enumerable: !0,
          get: function () {
            return u.Name;
          },
        }),
        Object.defineProperty(e, 'CodeGen', {
          enumerable: !0,
          get: function () {
            return u.CodeGen;
          },
        }));
      var d = y();
      Object.defineProperty(e, 'ValidationError', {
        enumerable: !0,
        get: function () {
          return d.default;
        },
      });
      var f = b();
      Object.defineProperty(e, 'MissingRefError', {
        enumerable: !0,
        get: function () {
          return f.default;
        },
      });
    })().default;
    self.onmessage = ({ data: e }) => {
      try {
        let t = new Pe({
            allErrors: !0,
            strictSchema: !0,
            strictTypes: !1,
            strictTuples: !1,
            strictRequired: !1,
            validateFormats: !1,
            logger: !1,
          }).compile(e.schema),
          n = t(e.value);
        self.postMessage({
          valid: n,
          errors: (t.errors || []).map((e) => ({
            path: e.instancePath || `/`,
            keyword: e.keyword,
            detail: e.params,
          })),
        });
      } catch (e) {
        self.postMessage({ problem: e.message });
      }
    };
  })();
}
