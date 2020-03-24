/*
    FastTemplate
    Author:FancyFlame
*/
{
    const templates = {};
    const DataSource = function (node, once) {
        /*if (node.ftmComputed) { return; }
        else {
            //console.log(node.ftmAlive);
        }*/
        if (!new.target) return new DataSource(...arguments);
        let data = this;
        let watchPool = new Set();
        let ftmData = {};
        let ftmProxy;
        data[DataSource.watch] = function (watcher) {
            watchPool.add(watcher);
            Object.keys(ftmData).forEach(x => watcher.render(x));
        };
        data[DataSource.unwatch] = function (watcher) {
            watchPool.delete(watcher);
        };
        //设置ftmProxy选项
        let haveSettedData = false;
        //console.log(target.ftmData);
        Object.defineProperty(node, "ftmData", {
            get: function () {
                return data;
            },
            set: function (v) {
                //劫持get和set
                if (once && haveSettedData) return;
                haveSettedData = true;
                Object.keys(ftmData).forEach(x => delete data[x]);
                ftmData = Object.assign({}, v);
                Object.keys(v).forEach(prop => {
                    let options = {
                        get: function () {
                            return ftmData[prop];
                        },
                        set: function (v) {
                            if (once) return;
                            ftmData[prop] = v;
                            watchPool.forEach(x => {
                                x.render(prop);
                            });
                        }
                    };
                    Object.defineProperty(v, prop, options);
                    Object.defineProperty(data, prop, options);
                    watchPool.forEach(x => {
                        x.render(prop);
                    });
                });
                if (once) {
                    Object.freeze(v);//禁止修改
                }
                ftmProxy = v;
                /*ftmData = {};
                ftmProxy = new Proxy(ftmData, {
                    set: function (target, prop, value) {
                        target[prop] = value;
                        setNode(prop);
                    }
                });
                for (let i in v) {
                    ftmProxy[i] = v[i];
                }*/
            }
        });
    };
    DataSource.watch = Symbol("DataSourceWatch");
    DataSource.unwatch = Symbol("DataSourceUnwatch");
    const Binds = function (node) {
        let binds = this;
        let source = null;//绑定到ftmData
        Object.defineProperty(binds, "source", {
            get: function () {
                return source;
            },
            set: function (data) {
                if (source) source[DataSource.unwatch](binds);
                source = data;
                data[DataSource.watch](binds);
            }
        });

        binds.listeners = {
            //模板里头绑定的数据
            /*
            var1:{
                attr:Map {
                    [object HTMLDivElement]:{
                        attrname1:"%{foo}",
                        attrname2:"abcde%{bar}"
                    }
                },
                innr:Map {
                    [object #Text]:"%{name} is a text node!!"
                }
            }
            */
        };

        //这块负责读取需要的模块
        const detectVar = (name) => {
            //创建一个观察变量
            if (!binds.listeners[name]) {
                (binds.listeners[name] = {
                    attr: new Map(),
                    innr: new Map()
                });
            }
            return binds.listeners[name];
        };
        detectVar("##javascript");
        function getRequirement(refe) {
            if (refe.nodeType === 1) {
                //元素节点
                for (let i = 0; i < refe.attributes.length; i++) {
                    let a = refe.attributes[i];
                    let arr = readBlock(a.value);
                    arr.forEach((e) => {
                        //e = e.slice(2, -1);//去除%{和}
                        let obj = detectVar(e);
                        let current = obj.attr.get(refe);//变量的属性的当前元素分区
                        if (!current) {
                            current = {};
                            obj.attr.set(refe, current);
                        }
                        current[a.name] = a.value;
                    });
                }
                refe.childNodes.forEach(e => { if (!e.ftmComputed) DOMchange(e, binds); });
            } else if (refe.nodeType === 3) {
                //文本节点
                let arr = readBlock(refe.nodeValue);
                arr.forEach((e) => {
                    //e = e.slice(2, -1);//去除%{和}
                    let obj = detectVar(e);
                    obj.innr.set(refe, refe.nodeValue);
                });
            }
        }
        binds.watch = getRequirement;
        getRequirement(node);

        //辅助读取ftmBlock
        function _readBlock(str) {
            let blocks = [];//里面提供：[<number Start>,<string completeContent>,<string requires>]
            let reg = /%{/g;
            //检测每个可能是ftmBlock的块
            while (true) {
                if (!reg.exec(str)) break;//这里还有记录lastIndex的作用，此时lastIndex是完整的ftmBlock开端
                let startIndex = reg.lastIndex - 2;
                let rest = str.slice(reg.lastIndex);//从完整的ftmBlock开端开始截取后面的字符串
                let type = rest.match(/^js\:|^glb-js\:|^html\:|^[\w\$]+(?=\})/);
                type = type && type[0];
                if (!type) {
                    //不符合要求
                    continue;
                }
                //深入ftmBlock检测所需变量
                switch (type) {
                    case null:
                        break;
                    case "glb-js:":
                    case "js:":
                        let stacks = 1;//记录大括号
                        let quotes = null;
                        let reg2 = /(?<!\\)[`"'\/]|[{}]/g;
                        while (true) {
                            let spliter = reg2.exec(rest)[0];
                            if (!spliter) break;//括号未闭合
                            if (/["'`\/]/.test(spliter)) {
                                //是引号
                                if (!quotes) quotes = spliter;
                                else if (quotes == spliter) quotes = null;
                            } else {
                                if (quotes) continue;//如果被包含在引号内则跳过
                                if (spliter == "{") stacks++;
                                else if (spliter == "}") {
                                    if (--stacks == 0) {
                                        //js引用结束，输出也包含}
                                        let ctt = str.slice(startIndex, reg.lastIndex + reg2.lastIndex);
                                        //lazy-js就是仅当当前属性或文本变化时才被动渲染
                                        if (type == "glb-js:") blocks.push([startIndex, ctt, "##javascript"]);
                                        else {
                                            let raw = ctt.slice(ctt.indexOf(":") + 1, -1);
                                            let detect = raw.match(/(?<=(?<![\w\$])data\.)([\w\$]+)/g);
                                            blocks.push([startIndex, ctt, detect]);
                                        }
                                        reg.lastIndex += ctt.length + 1 - 2;
                                        break;
                                    }
                                }
                            }
                        }
                        break;
                    case "html:": {//这个括号创建局部环境
                        let skip = rest.indexOf("}");
                        blocks.push([
                            startIndex,
                            "%{" + rest.slice(0, skip) + "}",  //不用skip+1是因为这样利于理解
                            rest.slice(rest.indexOf(":") + 1, skip)
                        ]);
                        reg.lastIndex += skip + 1 - 2;
                        break;
                    }
                    default: {
                        let skip = rest.indexOf("}");
                        blocks.push([
                            startIndex, "%{" + rest.slice(0, skip) + "}", rest.slice(0, skip)
                        ]);
                        reg.lastIndex += skip + 1 - 2;
                        break;
                    }
                }
            }
            return blocks;
        }
        //给出需要绑定的变量
        function readBlock(str) {
            let newarr = [];
            _readBlock(str).forEach(x => {
                let el = x[2];
                if (el instanceof Array) newarr = newarr.concat(el);
                else newarr.push(el);
            });
            return newarr;
        }
        //实例化一个模板
        function overrideBlock(str) {
            if (!source) throw "Please connect to a Data object first";
            let offset = 0;
            let arr = _readBlock(str);
            for (let o of arr) {
                let [start, content] = o;
                let rawctt = content.slice(content.indexOf(":") > -1 ? content.indexOf(":") + 1 : 2, -1);//裁剪出来的有效部分
                let type = content.indexOf(":");
                type = type == -1 ? "string" : content.slice(2, type);
                let repla = "<Err_Unknown_Type>";
                if (type == "string") {
                    repla = source[rawctt];
                    if (repla instanceof Node) return repla;
                    else repla = String(repla);
                } else if (type == "js" || type == "glb-js") {
                    try {
                        repla = new Function("data", "return (" + rawctt + ")").call(node, source);
                        if (repla instanceof Node) return repla;
                        else repla = String(repla);
                    } catch (err) {
                        repla = err.toString();
                    }
                } else if (type == "html") {
                    let html = ftmData[rawctt];
                    return html.cloneNode(true);
                }
                str = str.slice(0, start + offset) + repla + str.slice(start + offset + content.length);
                offset += repla.length - content.length;
            }
            return str;
        }
        //写入
        function setNode(prop) {
            if (!binds.listeners[prop]) {
                //console.log(binds);
                return;
            }
            let { attr, innr } = binds.listeners[prop];
            let isHTML = false;
            //写入属性
            for (let o of attr) {
                let [ele, a] = o;
                if (ele.getRootNode() == ele) {
                    attr.delete(ele);
                    return;
                }
                //a是个普通的object，储存了属性的键值信息
                for (let n in a) {
                    let str = a[n];//属性模板字符串
                    str = overrideBlock(str);
                    let attrname = n.slice(0, 4) == "ftm:" ? n.slice(4) : n;
                    if (attrname == "ftm-use-html") {
                        if (str instanceof Node && str.childNodes.length > 0) {
                            ele.innerHTML = "";
                            ele.appendChild(str);
                            isHTML = true;
                        }
                    }
                    ele.setAttribute(attrname, str);
                }
            }
            //写入文本
            if (!isHTML) {
                innr.forEach((str, va) => {
                    if (va.getRootNode() == va) {
                        innr.delete(va);
                        return;
                    }
                    str = overrideBlock(str);
                    va.nodeValue = String(str);
                });
            }
        }

        //延迟渲染
        let waitingRender = new Set();
        function renderAfterFinished(prop) {
            if (waitingRender.size == 0) {
                setTimeout(() => {
                    waitingRender.add("##javascript");
                    waitingRender.forEach(e => {
                        setNode(e);
                    });
                    waitingRender.clear();
                });
            }
            waitingRender.add(prop);
        }
        binds.render = renderAfterFinished;
    };
    function DOMchange(target, parentBinds, isAdd = true) {
        if (target.nodeName.toLowerCase() == "template" && target.hasAttribute("ftm-el")) {
            //录入模板
            let temname = target.getAttribute("ftm-el");
            if (isAdd) {
                templates[temname] = target;
            } else {
                delete templates[temname];
            }
        } else if (isAdd) {
            if (target.ftmComputed) return;
            target.ftmComputed = true;
            let isSource = target.nodeName == "FTM-SRC" || (target.nodeType == 1 && target.hasAttribute("ftm-src"));
            let tem = templates[target.nodeName.toLowerCase()];
            function getLoader() {
                let n = target.parentElement;
                while (n && !n.ftmData) {
                    n = n.parentElement;
                }
                return n;
            }
            if (!tem && !isSource) {
                if (!parentBinds) {
                    let n = getLoader();
                    if (n) parentBinds = n.ftmBinds;
                    else return;
                }
                parentBinds.watch(target);
                return;
            }
            if (!isSource)
                for (let attr of tem.attributes) {
                    let { name: i, value: o } = attr;
                    let isftm = /^ftm\-/;
                    //如果属性是以ftm-开头并且不是ftm-el也不是ftm-src并且当前元素没有声明这个属性
                    if (isftm.test(i) && i != "ftm-el" && i != "ftm-src" && !target.hasAttribute(i)) {
                        target.setAttribute(i, o);
                        console.log(i);
                    } else console.log(i);
                }
            let once = target.getAttribute("ftm-once");
            once = once == "true" || once == "";
            let _source;//要连接到的其它ftmData
            let _ftmData = (function () {
                /*if (target.tagName == "BIG-CODE") debugger;
                else console.log(target.tagName);*/
                if (target.ftmData) return target.ftmData;
                let obj = {};
                function getFtmData(s) {
                    let data = s == "^" ? getLoader() : (() => {
                        try {
                            return document.querySelector(s.replace(/&gt;/g, ">"));
                        } catch (err) {
                            console.warn("Invalid selector " + s);
                            return null;
                        }
                    })();
                    if (data && !data.ftmData) {
                        console.warn("The element attach to must has ftmData");
                        console.warn(data);
                        return null;
                    }
                    return data && data.ftmData;
                }
                {//与其它数据源的绑定和继承关系
                    let cp = target.getAttribute("ftm-cpdata");
                    if (cp) {
                        let arr = cp.split(",");
                        arr.forEach(x => {
                            let d = getFtmData(x);
                            if (d) Object.assign(obj, d);
                        });
                    }
                    let use = target.getAttribute("ftm-bddata");
                    if (use) {
                        let data = getFtmData(use);
                        if (data) _source = data;
                    }
                }

                let args = target.getAttribute("ftm-args");
                if (args !== null) debugger;
                if (target.childNodes.length < 1) return obj;
                let str = target.querySelector("pre[ftm-data]");
                str = str ? str.innerHTML : target.firstChild.nodeValue;//第一个节点应该是文本节点
                if (args) {
                    //识别快捷参数
                    let r = args.split(/ +/);
                    str = str.trim().split(/ +/);
                    r.forEach((k, i) => {
                        if (!k) return; //可能是遇到了连续空格
                        if (str[i]) {
                            let v = str[i].replace(/\\s/g, " "); //将所有的\s替换成空格
                            try {
                                obj[k] = JSON.parse('"' + v + '"');
                            } catch (err) { }
                        }
                    });
                } else {
                    //识别标准键值对
                    str = str.replace(/^\s*\n|\n\s*$/g, "");//去掉头尾无用空白符，保留缩进
                    str = str.split("\n");
                    let keyIndent = str[0].match(/^\s*/)[0];
                    let lastkey;
                    for (let i in str) {
                        let x = str[i];
                        let s;
                        x = x.replace(/^\s*/, function (match) {
                            s = match;
                            return "";
                        });
                        if (!x) continue;
                        if (s == keyIndent) {
                            let isCopy = /^\+\{[^\}]+\}$/;
                            if (isCopy.test(x)) {
                                //复制一份
                                let data = getFtmData(x.match(isCopy)[0].slice(2, -1));
                                if (data) {
                                    Object.assign(obj, data);
                                }
                                continue;
                            }
                            //匹配开端
                            let foo = x.split(":");
                            //缩进是关键字缩进
                            lastkey = foo[0];
                            obj[lastkey] = foo.slice(1).join("");
                        } else {
                            obj[lastkey] += "\n" + (s > keyIndent ? s.slice(keyIndent.length) : "") + x;
                        }
                    }
                }

                //获取子html元素设定为参数
                for (let x of target.children) {
                    let key = x.getAttribute("ftm-key");
                    if (key === null) continue;
                    //这个是表示只取子元素
                    let inHTML = (x.hasAttribute("ftm-in-html") ? x.getAttribute("ftm-in-html") : target.getAttribute("ftm-in-html"));
                    if (inHTML == "true" || inHTML == "") {
                        if (x.tagName == "TEMPLATE") {
                            x = x.content.cloneNode(true);
                        } else {
                            let fra = document.createDocumentFragment();
                            for (let y of Array.from(x.childNodes)) {//childNodes是实时的，所以需要先转换成Array
                                fra.appendChild(y);
                            }
                            x = fra;
                        }
                    }
                    obj[key] = x;
                }
                return obj;
            })();
            //配置
            let ftmData = new DataSource(target, once);
            target.ftmData = _ftmData;
            if (!isSource) {
                let binds = new Binds(target);
                target.ftmBinds = binds;
                binds.source = _source || ftmData;
            }

            //导入模板
            target.innerHTML = "";
            if (!isSource) {
                let ctt = document.importNode(tem.content, true);
                target.appendChild(ctt);
            }

            //读取模板
            //匹配%{var}
            //const reg = /\%{([\w\$]+)}/g;

            //读取节点观察节点是否需要绑定到变量

            //最后把初始化数据应用进去
        }
    }
    let mutobs = new MutationObserver((records) => {
        for (let o of records) {
            //只有childList选项
            let isAdd = Boolean(o.addedNodes.length > 0);
            let nodes = isAdd ? o.addedNodes : o.removedNodes;
            nodes.forEach((o) => {
                DOMchange(o, null, isAdd);
            });
        }
    });
    mutobs.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    /*window.addEventListener("load", () => {
        DOMchange({
            addedNodes: [document.documentElement]
        });
    });*/
}