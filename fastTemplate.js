/*
    Author:FancyFlame

    用法：
    <template id="sample" ftm-el="show-img">
        <img src="http://abc.example.com/?{path}?type=nature"></img>
        图片名称：?{name}
        描述：?{desc}
    </template>
    <show-img>
        {
            
        }
    </show-img>

    也可以：
    let im=document.createElement("show-img");
    im.ftmData={
        "path":"flowers.jpg",
        "name":"花朵",
        "desc":"许多许多的花朵绽放在山坡上"
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
                    templates[temname] = target;
                } else {
                    delete templates[temname];
                }
            } else if (isAdd) {
                let tem = templates[target.nodeName.toLowerCase()];
                let binds = { //模板里头绑定的数据
                    /*
                    var1:{
                        attr:Map {
                            [object HTMLDivElement]:{
                                attrname1:"?{foo}",
                                attrname2:"abcde?{bar}"
                            }
                        },
                        innr:Map {
                            [object #Text]:"?{name} is a text node!!"
                        }
                    }
                    */
                };
                if (!tem) return;

                //导入模板
                let _ftmData = (function () {
                    if (target.ftmData) return target.ftmData;
                    try {
                        return JSON.parse(target.innerText);
                    } catch (err) {
                        return {};
                    }
                })();
                let ftmData = {};
                target.innerHTML = "";
                let ctt = document.importNode(tem.content, true);
                target.appendChild(ctt);

                //读取模板
                //匹配?{var}
                const reg = /\?{([\w\$]+)}/g;

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
                    if (node.nodeType === 1) {
                        //元素节点
                        for (let i = 0; i < node.attributes.length; i++) {
                            let a = node.attributes[i];
                            let arr = a.value.match(reg) || [];
                            arr.forEach((e) => {
                                e = e.slice(2, -1);//去除?{和}
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
                        let arr = node.nodeValue.match(reg) || [];

                        arr.forEach((e) => {
                            e = e.slice(2, -1);//去除?{和}
                            let obj = detectVar(e);
                            obj.innr.set(node, node.nodeValue);
                        });
                    }

                    //设置ftmProxy选项
                    let ftmProxy;
                    //console.log(target.ftmData);
                    if (node.ftmAlive) return;
                    Object.defineProperty(node, "ftmData", {
                        get: function () {
                            return ftmProxy;
                        },
                        set: function (v) {
                            //劫持get和set
                            ftmData = Object.assign({}, v);
                            Object.keys(v).forEach(prop => {
                                Object.defineProperty(v, prop, {
                                    get: function () {
                                        return ftmData[prop];
                                    },
                                    set: function (v) {
                                        ftmData[prop] = v;
                                        setNode(prop);
                                    }
                                });
                                setNode(prop);
                            });
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
                                str = str.replace(reg, function (_, p1) {
                                    return ftmData[p1] || "";
                                });
                                ele.setAttribute(n.slice(0, 4) == "ftm:" ? n.slice(4) : n, str);
                            }
                        });
                        //写入文本
                        innr.forEach((str, va) => {
                            if (va.getRootNode() != document) {
                                innr.delete(va);
                                return;
                            }
                            str = str.replace(reg, function (_, p1) {
                                return ftmData[p1] || "";
                            });
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
    window.addEventListener("load", () => {
        DOMchange({
            addedNodes: [document.documentElement]
        });
    });
}