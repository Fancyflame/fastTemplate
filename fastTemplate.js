/*
    Author:FancyFlame

    用法：
    <template id="sample" ftm-el="show-img">
        <img src="http://abc.example.com/%{path}?type=nature"></img>
        图片名称：%{name}
        描述：%{desc}
        这是第%{js:ftmData.num<0?1:ftmData.num}张图片
    </template>
    <show-img>
        path:flowers.jpg
        name:花朵
        desc:许多许多的花
            绽放在山坡上
            真好看
        num:-2
    </show-img>

    也可以：
    let im=document.createElement("show-img");
    im.ftmData={
        path:"flowers.jpg",
        name:"花朵",
        desc:"许多许多的花朵绽放在山坡上",
        num:-2
    };
    document.body.appendChild(im);

    变为：
    show-img element:
    {
        ftmData:{
            "path":"flowers.jpg",
            "name":"花朵",
            "desc":"许多许多的花朵绽放在山坡上"
        },
        childNodes:[
            [object HTMLImageElement],
            [object #Text],
            ...
        ]
    }

    *变量名只允许包含数字、字母、$和_
    *如果文档在放入页面document后就不允许直接修改innerText了，否则实时响应会不起作用
    *ftmData可以被直接被赋值，但是不推荐这样做（除非还没绑定到document，不然可能有未知的bug），建议仅修改和获取
    *元素会根据文档顺序读取，请确保template元素在模板元素前面，或者在页面加载完后动态生成也是可以的
*/
{
    const templates = {};
    function DOMchange(o) {
        //只有childList选项
        let isAdd = Boolean(o.addedNodes.length > 0);
        let nodes = isAdd ? o.addedNodes : o.removedNodes;
        nodes.forEach((target) => {
            if (target.nodeName.toLowerCase() == "template") {
                //录入模板
                let temname = target.getAttribute("ftm-el");
                if (!temname) return;
                if (isAdd) {
                    templates[temname] = {
                        ele: target,
                        once: target.getAttribute("ftm-once") == "true"
                    };
                } else {
                    delete templates[temname];
                }
            } else if (isAdd) {
                let { ele: tem, once } = templates[target.nodeName.toLowerCase()] || {};
                if (!tem) return;
                {
                    let _once = target.getAttribute("ftm-once");
                    if (_once) once = _once == "true";
                }
                let binds = { //模板里头绑定的数据
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
                //导入模板
                let _ftmData = (function () {
                    if (target.ftmData) return target.ftmData;
                    let obj = {};
                    let str = target.firstElementChild && target.firstElementChild.nodeName == "PRE" ?
                        target.firstElementChild : target;
                    //分段写法
                    str = str.innerHTML.replace(/^\n*|\n*$/g, "");
                    let match = /(^\s*)(.*)/mg;
                    //固定的缩进
                    let keyIndent = match.exec(str)[1];
                    match.lastIndex = 0;
                    let valueIndent = null;
                    let lastkey;
                    while (true) {
                        let fullstr = match.exec(str);
                        if (fullstr === null) break;
                        let wsp = fullstr[1];//white space
                        let word = fullstr[2];//有效字段
                        if (wsp == keyIndent) {
                            //匹配开端
                            let foo = word.split(":");
                            //缩进是关键字缩进
                            valueIndent = null;
                            lastkey = foo[0];
                            obj[lastkey] = foo.slice(1).join("");
                        } else {
                            //缩进是长段文本缩进
                            if (valueIndent == null) {
                                valueIndent = wsp;
                            }
                            obj[lastkey] += "\n" + (wsp.length > valueIndent.length ? wsp.slice(valueIndent.length) : "") + word;
                        }
                    }
                    return obj;
                })();
                let ftmData = {};
                target.innerHTML = "";
                let ctt = document.importNode(tem.content, true);
                target.appendChild(ctt);

                //读取模板
                //匹配%{var}
                //const reg = /\%{([\w\$]+)}/g;

                //读取节点观察节点是否需要绑定到变量
                function readNode(node) {
                    if (node.ftmAlive) { return; }
                    else {
                        //console.log(node.ftmAlive);
                    }
                    function detectVar(name) {
                        //创建一个观察变量
                        if (!binds[name]) {
                            (binds[name] = {
                                attr: new Map(),
                                innr: new Map()
                            });
                        }
                        return binds[name];
                    }

                    //辅助读取ftmBlock
                    function _readBlock(str) {
                        let blocks = [];//里面提供：[<number Start>,<string completeContent>,<string requires>]
                        let reg = /%{/g;
                        //检测每个可能是ftmBlock的块
                        while (true) {
                            if (!reg.exec(str)) break;//这里还有记录lastIndex的作用，此时lastIndex是完整的ftmBlock开端
                            let startIndex = reg.lastIndex - 2;
                            let rest = str.slice(reg.lastIndex);//从完整的ftmBlock开端开始截取后面的字符串
                            let type = rest.match(/^js\:|^lazy-js\:|^html\:|^[\w\$]+(?=\})/);
                            type = type && type[0];
                            if (!type) {
                                //不符合要求
                                continue;
                            }
                            //深入ftmBlock检测所需变量
                            switch (type) {
                                case null:
                                    break;
                                case "lazy-js":
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
                                                    if (type == "js:") blocks.push([startIndex, ctt, "##javascript"]);
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
                        return _readBlock(str).map(x => x[2]);
                    }
                    //实例化一个模板
                    function overrideBlock(str) {
                        let offset = 0;
                        let arr = _readBlock(str);
                        for (let o of arr) {
                            let [start, content] = o;
                            let rawctt = content.slice(content.indexOf(":") > -1 ? content.indexOf(":") + 1 : 2, -1);//裁剪出来的有效部分
                            let type = content.indexOf(":");
                            type = type == -1 ? "string" : content.slice(2, type);
                            let repla = "<Err_Unknown_Type>";
                            if (type == "string") {
                                repla = String(ftmData[rawctt]);
                            } else if (type == "js" || type == "lazy-js") {
                                try {
                                    repla = new Function("ftmData", "return (" + rawctt + ")")(ftmProxy);
                                    repla = String(repla);
                                } catch (err) {
                                    repla = err.toString();
                                }
                            }
                            str = str.slice(0, start + offset) + repla + str.slice(start + offset + content.length);
                            offset += repla.length - content.length;
                        }
                        return str;
                    }

                    detectVar("##javascript");
                    if (node.nodeType === 1) {
                        //元素节点
                        for (let i = 0; i < node.attributes.length; i++) {
                            let a = node.attributes[i];
                            let arr = readBlock(a.value);
                            arr.forEach((e) => {
                                //e = e.slice(2, -1);//去除%{和}
                                let obj = detectVar(e);
                                let current = obj.attr.get(node);//变量的属性的当前元素分区
                                if (!current) {
                                    current = {};
                                    obj.attr.set(node, current);
                                }
                                current[a.name] = a.value;
                            });
                        }
                        node.childNodes.forEach(readNode);
                    } else if (node.nodeType === 3) {
                        //文本节点
                        let arr = readBlock(node.nodeValue);
                        arr.forEach((e) => {
                            //e = e.slice(2, -1);//去除%{和}
                            let obj = detectVar(e);
                            obj.innr.set(node, node.nodeValue);
                        });
                    }

                    let waitingRender;
                    //延迟渲染
                    function renderAfterFinished(prop) {
                        if (!waitingRender) {
                            waitingRender = [];
                            setTimeout(() => {
                                waitingRender.push("##javascript");
                                waitingRender.forEach(e => {
                                    setNode(e);
                                });
                                waitingRender = null;
                            });
                        }
                        if (!waitingRender.includes(prop)) waitingRender.push(prop);
                    }

                    //设置ftmProxy选项
                    let ftmProxy;
                    let haveSettedData = false;
                    //console.log(target.ftmData);
                    Object.defineProperty(node, "ftmData", {
                        get: function () {
                            return ftmProxy;
                        },
                        set: function (v) {
                            //劫持get和set
                            if (once && haveSettedData) return;
                            haveSettedData = true;
                            ftmData = Object.assign({}, v);
                            Object.keys(v).forEach(prop => {
                                if (!once) {
                                    Object.defineProperty(v, prop, {
                                        get: function () {
                                            return ftmData[prop];
                                        },
                                        set: function (v) {
                                            ftmData[prop] = v;
                                            renderAfterFinished(prop);
                                        }
                                    });
                                }
                                renderAfterFinished(prop, false);
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
                    node.ftmAlive = true;
                    function setNode(prop) {
                        if (!binds[prop]) {
                            //console.log(binds);
                            return;
                        }
                        let { attr, innr } = binds[prop];
                        //写入属性
                        attr.forEach((a, ele) => {
                            if (ele.getRootNode() != document) {
                                attr.delete(ele);
                                return;
                            }
                            //a是个普通的object，储存了属性的键值信息
                            for (let n in a) {
                                let str = a[n];//属性模板字符串
                                str = overrideBlock(str);
                                ele.setAttribute(n.slice(0, 4) == "ftm:" ? n.slice(4) : n, str);
                            }
                        });
                        //写入文本
                        innr.forEach((str, va) => {
                            if (va.getRootNode() != document) {
                                innr.delete(va);
                                return;
                            }
                            str = overrideBlock(str);
                            va.nodeValue = str;
                        });
                    }

                    //最后把初始化数据应用进去
                    node.ftmData = _ftmData;
                }
                readNode(target);
            }
        });
    }
    let mutobs = new MutationObserver((records) => {
        for (let o of records) {
            DOMchange(o);
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