const fs = require("fs");

function brackets(string, start, endChar) {
  let runner = start;
  let counter = 0;
  while (runner < string.length) {
    const char = string[++runner];
    if (char == "<") {
      counter ++;
    } else if (char == ">") {
      counter --;
    } else if (char == endChar && counter == 0) {
      return runner;
    }
  }
  return runner;
}

function typeTree(type, additionalClasses, shortClassNames, isInterface) {
  if (type in shortClassNames) {
    return typeTree(shortClassNames[type], additionalClasses, shortClassNames, isInterface);
  }
  if (type.endsWith("[]")) {
    const main = typeTree(type.slice(0, -2), additionalClasses, shortClassNames);
    return { "type": "array", main, "wrapped": main.wrapped, "generic": main.generic };
  }
  if (type.endsWith(">")) {
    const start = type.indexOf("<");
    let runner = start;
    let last = runner;
    let counter = 1;
    const gens = [];
    while (counter) {
      const char = type[++runner];
      if (char == "<") {
        counter ++;
      } else if (char == ">") {
        counter --;
        if (!counter) {
          gens.push(type.slice(last + 1, runner).trim());
        }
      } else if (char == "," && counter == 1) {
        gens.push(type.slice(last + 1, runner).trim());
        last = runner;
      }
    }
    const rmain = type.slice(0, start);
    const main = shortClassNames[rmain] ?? rmain;
    if (main.includes("/") || main.startsWith("!")) {
      console.log("Wrapper classes/interfaces shouldn't be generic!");
      process.exit(1);
    }
    const generics = gens.map(g => typeTree(g, additionalClasses, shortClassNames));
    return { "type": "generic", main, generics, "wrapped": generics.some(g => g.wrapped), "generic": true };
  }
  if (type.includes("/") || type.startsWith("!")) {
    if (type.startsWith("!")) {
      type = type.slice(1);
    }
    additionalClasses.push({ "parent": (isInterface ? "interface " : "class ") + type, "children": [] });
    const main = "dev.gxlg.multiversion.gen." + type.split("/").slice(-1)[0] + "Wrapper" + (isInterface ? "Interface" : "");
    return { "type": "wrapper", main, "wrapped": true, "generic": false };
  }
  if (type == "void") {
    return { "type": "void", "main": "void", "wrapped": false, "generic": false };
  }
  if (type == "Object") {
    return { "type": "object", "main": "Object", "wrapped": false, "generic": false };
  }
  return { "type": "java", "main": type, "wrapped": false, "generic": false };
}

function buildTypeString(tree) {
  const { type, main, generics } = tree;
  if (type == "array") {
    return buildTypeString(main) + "[]";
  }
  if (type == "generic") {
    return main.replaceAll("$", ".") + "<" + generics.map(g => buildTypeString(g)).join(", ") + ">";
  }
  if (type == "wrapper") {
    return main;
  }
  return main.replaceAll("$", ".");
}

function buildClassGetter(tree) {
  const { type, main } = tree;
  if (type == "array") {
    return buildClassGetter(main) + ".arrayType()";
  }
  if (type == "wrapper") {
    return main + ".clazz.self()";
  }
  return main.replaceAll("$", ".") + ".class";
}

function buildSignatureType(tree) {
  const { type, main } = tree;
  if (type == "array") {
    return buildSignatureType(main) + "[]";
  }
  return main;
}

function buildWrapper(tree) {
  const { type, main, generics, wrapped, generic } = tree;
  if (type == "void" || type == "object") {
    return "%";
  } else if (type == "java") {
    return `(${main}) %`;
  } else if (type == "wrapper") {
    return `${main}.inst(%)`;
  } else if (type == "array") {
    if (!wrapped && !generic) {
      return `(${main.main}[]) %`;
    }
    return `R.arrayWrapper(${_buildWrapper(main)}).apply(%)`;
  } else if (type == "generic") {
    genericAdapters[main] = generics.length;
    return `dev.gxlg.multiversion.adapters.${main}Adapter.wrapper(${generics.map(_buildWrapper).join(", ")}).apply(%)`;
  }
}

function _buildWrapper(tree) {
  const { type, main, generics, wrapped, generic } = tree;
  if (type == "object") {
    return "x -> x";
  } else if (type == "java") {
    return `x -> (${main}) x`;
  } else if (type == "wrapper") {
    return `${main}::inst`;
  } else if (type == "array") {
    if (!wrapped && !generic) {
      return `x -> (${main.main}[]) x`;
    }
    return `R.arrayWrapper(${_buildWrapper(main)})`;
  } else if (type == "generic") {
    genericAdapters[main] = generics.length;
    return `dev.gxlg.multiversion.adapters.${main}Adapter.wrapper(${generics.map(_buildWrapper).join(", ")})`;
  }
}

function buildUnwrapper(tree) {
  const { type, main, generics, wrapped, generic } = tree;
  if (!wrapped) {
    return "%";
  }
  if (type == "void" || type == "object" || type == "java") {
    return `%`;
  } else if (type == "wrapper") {
    return `%.unwrap()`;
  } else if (type == "array") {
    return `R.<${buildTypeString(main)}>arrayUnwrapper(${_buildUnwrapper(main)}).apply(%)`;
  } else if (type == "generic") {
    genericAdapters[main] = generics.length;
    return `dev.gxlg.multiversion.adapters.${main}Adapter.<${generics.map(buildTypeString)}>unwrapper(${generics.map(_buildUnwrapper).join(", ")}).apply(%)`;
  }
}

function _buildUnwrapper(tree) {
  const { type, main, generics, wrapped, generic } = tree;
  if (!wrapped) {
    return "x -> x";
  }
  if (type == "object" || type == "java") {
    return `x -> x`;
  } else if (type == "wrapper") {
    return `${main}::unwrap`;
  } else if (type == "array") {
    return `R.arrayUnwrapper(${_buildUnwrapper(main)})`;
  } else if (type == "generic") {
    genericAdapters[main] = generics.length;
    return `dev.gxlg.multiversion.adapters.${main}Adapter.unwrapper(${generics.map(_buildUnwrapper).join(", ")})`;
  }
}

function whitespace(line) {
  const tline = line.trimStart();
  return [line.length - tline.length, tline.trimEnd()];
}

function processPart(children, lines, start=0) {
  while (lines.length) {
    const [ws, parent] = whitespace(lines[0]);
    if (ws < start) {
      return;
    } else if (ws == start) {
      children.push({ parent, "children": [] });
      lines.shift();
    } else if (ws > start) {
      const parent = children.slice(-1)[0];
      processPart(parent.children, lines, ws);
    }
  }
}

function getMethodName(rawMethodName, argumentsSignature, signatures) {
  const methodSignature = rawMethodName + "(" + argumentsSignature.join(",") + ")";
  if (methodSignature in signatures) {
    const id = signatures[methodSignature] + 1;
    signatures[methodSignature] = id;
    return rawMethodName + id.toString();
  } else {
    signatures[methodSignature] = 1;
    return rawMethodName;
  }
}

const { root } = JSON.parse(fs.readFileSync("./multi-version.json", "utf-8"));
const file = fs.readFileSync("src/" + root + "/dev/gxlg/multiversion/multi-version.mapping", "utf-8").trim();

const rlines = file.split("\n").map(l => l.split("#")[0].trimEnd()).filter(l => l.trim().length);
const shortClassNames = {};
const lines = [];
for (const line of rlines) {
  if (line.startsWith("import ")) {
    const className = line.slice(7).trimStart();
    const shortName = className.split(".").slice(-1)[0];
    shortClassNames[shortName] = className;
  } else {
    lines.push(line);
  }
}

const classes = [];
const additionalClasses = [];
const genericAdapters = {};
processPart(classes, lines);

if (!classes.length) {
  console.log("Nothing to process!");
  process.exit(0);
}

// fileName: content
const processedClasses = {};

function processClass(part) {
  if (part.parent.startsWith("interface ")) {
    processInterface(part);
    return;
  }

  if (!part.parent.startsWith("class ")) {
    console.log("Invalid entrypoint: needs to be either class or interface!");
    process.exit(1);
  }

  const parts = part.parent.slice(6).trimStart().split(/[ ]+/);
  const leftClass = parts.shift();
  let extendingClassString = null;
  if (parts[0] == "extends") {
    parts.shift();
    const tree = typeTree(parts.shift(), additionalClasses, shortClassNames);
    if (tree.type != "wrapper") {
      console.log("Wrapper class can only extend other Wrapper classes!");
      process.exit(1);
    }
    extendingClassString = buildTypeString(tree);
  }
  const implementingInterfaces = [];
  if (parts[0] == "implements") {
    parts.shift();
    while (parts.length) {
      const c = parts.shift();
      const tree = typeTree(c, additionalClasses, shortClassNames, true);
      if (tree.type != "wrapper") {
        console.log("Wrapper class can only implement other Wrapper interfaces!");
        process.exit(1);
      }
      implementingInterfaces.push(buildTypeString(tree));
    }
  }

  // parse class name
  const rGetter = shortClassNames[leftClass] ?? leftClass
  const reflectionClassGetter = rGetter.startsWith("!") ? rGetter.slice(1) : rGetter;
  const fullyQualified = "dev.gxlg.multiversion.gen." + reflectionClassGetter.split("/").slice(-1)[0] + "Wrapper";
  if (fullyQualified in processedClasses) {
    return;
  }

  const className = fullyQualified.split(".").slice(-1)[0];
  const package = fullyQualified.split(".").slice(0, -1).join(".");

  // work out the body
  const staticMethods = [];
  const instanceMethods = [];

  const instanceFields = [];
  const instanceFieldInitializers = [];

  const constructors = [];
  const instanceMethodSignatures = { "unwrap()": 1, "unwrap(Class)": 1, "isInstanceOf(Class)": 1, "downcast(Class)": 1 };
  instanceMethodSignatures[`equals(${fullyQualified})`] = 1;
  const staticMethodSignatures = { "inst(Object)": 1 };

  let extensionConstructor = false;
  const extendedMethods = [];

  for (const child of part.children) {
    if (child.parent.includes("<init>")) {
      // constructor

      let lineToParse = child.parent;
      const toExtend = lineToParse.startsWith("* ");
      if (toExtend) {
        lineToParse = lineToParse.slice(2).trimStart();
      }

      const argumentsToParse = lineToParse.slice(6).trimStart().split("(")[1].slice(0, -1).trim();
      const arguments = [];
      let runner = 0;
      while (runner < argumentsToParse.length) {
        const argumentTypeIndex = brackets(argumentsToParse, runner, " ");
        const argumentTypeTree = typeTree(argumentsToParse.slice(runner, argumentTypeIndex), additionalClasses, shortClassNames);
        const separatorIndex = brackets(argumentsToParse, argumentTypeIndex + 1, ",")
        const argumentName = argumentsToParse.slice(argumentTypeIndex + 1, separatorIndex);
        runner = separatorIndex + 1;
        while (runner < argumentsToParse.length && argumentsToParse[runner] == " ") {
          runner ++;
        }
        arguments.push({ "name": argumentName, "type": argumentTypeTree });
      }

      if (toExtend) {
        constructors.push(
          `    protected ${className}(R.RClass eClazz${arguments.map(a => ", " + buildTypeString(a.type) + " " + a.name).join("")}) {\n` +
          `        this(eClazz, eClazz.constr(${arguments.map(a => buildClassGetter(a.type)).join(", ")}).newInst(${arguments.map(a => buildUnwrapper(a.type).replace("%", a.name)).join(", ")}).self());\n` +
          `    }`
        );
        if (!extensionConstructor) {
          // first time extension constructor, add wrapper setter
          constructors.push(
            `    protected ${className}(R.RClass eClazz, Object instance) {\n` +
            `        this(instance);\n` +
            `        eClazz.inst(this.instance).fld("__wrapper", ${className}.class).set(this);\n` +
            `    }`
          );
        }
        extensionConstructor = true;
      } else {
        constructors.push(
          `    public ${className}(${arguments.map(a => buildTypeString(a.type) + " " + a.name).join(", ")}) {\n` +
          `        this(clazz.constr(${arguments.map(a => buildClassGetter(a.type)).join(", ")}).newInst(${arguments.map(a => buildUnwrapper(a.type).replace("%", a.name)).join(", ")}).self());\n` +
          `    }`
        );
      }

    } else if (child.parent.endsWith(")")) {
      // method

      let lineToParse = child.parent;
      const toExtend = lineToParse.startsWith("* ");
      if (toExtend) {
        lineToParse = lineToParse.slice(2).trimStart();
      }
      const toAccess = lineToParse.startsWith("+ ");
      if (toAccess) {
        lineToParse = lineToParse.slice(2).trimStart();
      }
      const isProtected = lineToParse.startsWith("protected ");
      if (isProtected) {
        lineToParse = lineToParse.slice(10).trimStart();
      }
      const isPrivate = lineToParse.startsWith("private ");
      if (isPrivate) {
        lineToParse = lineToParse.slice(8).trimStart();
      }
      const isStatic = lineToParse.startsWith("static ");
      if (isStatic) {
        lineToParse = lineToParse.slice(6).trimStart();
      }
      const isNullable = lineToParse.startsWith("? ");
      if (isNullable) {
        lineToParse = lineToParse.slice(2).trimStart();
      }

      if (isPrivate) {
        if (isProtected) {
          console.log("Can't mix 'protected' and 'private' methods!");
          process.exit(1);
        }
        if (toExtend) {
          console.log("Can't extend private methods!");
          process.exit(1);
        }
        if (!toAccess) {
          console.log("Private methods without an accessor don't make sense for wrappers!");
          process.exit(1);
        }
      }

      if (isStatic) {
        if (isPrivate) {
          console.log("Private static methods don't make sense for wrappers!");
          process.exit(1);
        }
        if (toExtend) {
          console.log("Can't extend static methods!");
          process.exit(1);
        }
      }

      if (toAccess) {
        if (!isPrivate && !isProtected) {
          console.log("Creating an accessor for public methods doesn't make sense for wrappers!");
          process.exit(1);
        }
      }

      const signatures = isStatic ? staticMethodSignatures : instanceMethodSignatures;

      const returnTypeIndex = brackets(lineToParse, 0, " ");
      const returnTypeTree = typeTree(lineToParse.slice(0, returnTypeIndex), additionalClasses, shortClassNames);

      if (returnTypeTree.type == "void") {
        if (isNullable) {
          console.log("Void methods can't be nullable!");
          process.exit(1);
        }
      }

      const reflectionMethodGetter = lineToParse.slice(returnTypeIndex + 1).trimStart().split("(")[0];
      const argumentsToParse = lineToParse.split("(")[1].slice(0, -1).trim();
      const arguments = [];
      let runner = 0;
      while (runner < argumentsToParse.length) {
        const argumentTypeIndex = brackets(argumentsToParse, runner, " ");
        const argumentTypeTree = typeTree(argumentsToParse.slice(runner, argumentTypeIndex), additionalClasses, shortClassNames);
        const separatorIndex = brackets(argumentsToParse, argumentTypeIndex + 1, ",")
        const argumentName = argumentsToParse.slice(argumentTypeIndex + 1, separatorIndex);
        runner = separatorIndex + 1;
        while (runner < argumentsToParse.length && argumentsToParse[runner] == " ") {
          runner ++;
        }
        arguments.push({ "name": argumentName, "type": argumentTypeTree });
      }

      const rawMethodName = reflectionMethodGetter.split("/").slice(-1)[0];
      const argumentsSignature = arguments.map(a => buildSignatureType(a.type));
      const methodName = getMethodName(rawMethodName, argumentsSignature, signatures);

      const methodParent = isStatic ? "clazz" : "clazz.inst(this.instance)";
      const methodsArray = isStatic ? staticMethods : instanceMethods;
      const access = isProtected ? "protected" : (isPrivate ? "private" : "public");
      const modifier = isStatic ? "static " : "";
      let body;
      if (isNullable) {
        const exec = `Object __return = ${methodParent}.mthd("${reflectionMethodGetter}", ${buildClassGetter(returnTypeTree)}${arguments.map(a => ", " + buildClassGetter(a.type)).join("")}).invk(${arguments.map(a => buildUnwrapper(a.type).replace("%", a.name)).join(", ")});\n`;
        const returnStatement = `        return __return == null ? null : ${buildWrapper(returnTypeTree).replace("%", "__return")}`;
        body = exec + returnStatement;
      } else {
        const exec = `${methodParent}.mthd("${reflectionMethodGetter}", ${buildClassGetter(returnTypeTree)}${arguments.map(a => ", " + buildClassGetter(a.type)).join("")}).invk(${arguments.map(a => buildUnwrapper(a.type).replace("%", a.name)).join(", ")})`;
        body = returnTypeTree.type == "void" ? exec : `return ${buildWrapper(returnTypeTree).replace("%", exec)}`;
      }
      const superCall = toExtend ? `        if (this instanceof ${className} && this.getClass() != ${className}.class) superCall++;\n` : "";
      methodsArray.push(
        `    ${access} ${modifier}${buildTypeString(returnTypeTree)} ${methodName}(${arguments.map(a => buildTypeString(a.type) + " " + a.name).join(", ")}){\n` +
        `${superCall}`  +
        `        ${body};\n` +
        `    }`
      );
      if (toExtend) {
        let body;
        if (isNullable) {
          const exec = `${buildTypeString(returnTypeTree)} __return = wrapper.${methodName}(${arguments.map((a, i) => buildWrapper(a.type).replace("%", "args[" + i + "]")).join(", ")});\n`;
          const returnStatement = `                return __return == null ? null : ${buildUnwrapper(returnTypeTree).replace("%", "__return")}`;
          body = exec + returnStatement;
        } else {
          const exec = `wrapper.${methodName}(${arguments.map((a, i) => buildWrapper(a.type).replace("%", "args[" + i + "]")).join(", ")})`;
          body = returnTypeTree.type == "void" ? `${exec};\n                return null` : `return ${buildUnwrapper(returnTypeTree).replace("%", exec)}`;
        }
        extendedMethods.push(
          `            if ((${reflectionMethodGetter.split("/").map(g => "methodName.equals(\"" + g + "\")").join(" || ")}) && R.methodMatches(method, ${buildClassGetter(returnTypeTree)}${arguments.map(a => ", " + buildClassGetter(a.type)).join("")})) {\n` +
          `                ${body};\n` +
          `            }`
        );
      }

      if (toAccess) {
        const rawMethodName = reflectionMethodGetter.split("/").slice(-1)[0] + "Accessible";
        const accMethodName = getMethodName(rawMethodName, argumentsSignature, signatures);
        const returnStatement = returnTypeTree.type == "void" ? "" : "return ";
        methodsArray.push(
          `    public ${modifier}${buildTypeString(returnTypeTree)} ${accMethodName}(${arguments.map(a => buildTypeString(a.type) + " " + a.name).join(", ")}){\n` +
          `        ${returnStatement}${methodName}(${arguments.map(a => a.name).join(", ")});\n` +
          `    }`
        );
      }

    } else if (child.parent.startsWith("class ") || child.parent.startsWith("interface ")) {
      // class
      classes.push(child);

    } else {
      // field

      let lineToParse = child.parent;
      const toAccess = lineToParse.startsWith("+ ");
      if (toAccess) {
        lineToParse = lineToParse.slice(2).trimStart();
      }
      const isNullable = lineToParse.startsWith("? ");
      if (isNullable) {
        lineToParse = lineToParse.slice(2).trimStart();
      }
      const isStatic = lineToParse.startsWith("static ");
      if (isStatic) {
        lineToParse = lineToParse.slice(7).trimStart();
      }

      const fieldTypeIndex = brackets(lineToParse, 0, " ");
      const fieldTypeTree = typeTree(lineToParse.slice(0, fieldTypeIndex), additionalClasses, shortClassNames);

      if (fieldTypeTree.type == "void") {
        console.log("Fields can't be of type void!");
        process.exit(1);
      }

      const reflectionFieldGetter = lineToParse.slice(fieldTypeIndex + 1).trim();
      const fieldName = reflectionFieldGetter.split("/").slice(-1)[0] + (toAccess ? "Accessible" : "") + (isStatic ? "" : "Field");

      if (isStatic) {
        const fieldMethodName = getMethodName(fieldName, [], staticMethodSignatures);
        const exec = `clazz.fld("${reflectionFieldGetter}", ${buildClassGetter(fieldTypeTree)}).get()`;
        let body;
        if (isNullable) {
          body = `Object __return = ${exec};\n        return __return == null ? null : ${buildWrapper(fieldTypeTree).replace("%", "__return")}`;
        } else {
          body = `return ${buildWrapper(fieldTypeTree).replace("%", exec)}`;
        }

        staticMethods.push(
          `    public static ${buildTypeString(fieldTypeTree)} ${fieldMethodName}() {\n` +
          `        ${body};\n` +
          `    }`
        );

      } else {
        instanceFields.push(`    private final R.RField ${fieldName};`);
        instanceFieldInitializers.push(`        this.${fieldName} = rInstance.fld("${reflectionFieldGetter}", ${buildClassGetter(fieldTypeTree)});`);

        const capitalName = fieldName.slice(0, 1).toUpperCase() + fieldName.slice(1);
        const getterMethodName = getMethodName("get" + capitalName, [], instanceMethodSignatures);
        const fieldTypeString = buildTypeString(fieldTypeTree);

        const exec = `this.${fieldName}.get()`;
        let body;
        if (isNullable) {
          body = `Object __return = ${exec};\n        return __return == null ? null : ${buildWrapper(fieldTypeTree).replace("%", "__return")}`;
        } else {
          body = `return ${buildWrapper(fieldTypeTree).replace("%", exec)}`;
        }

        instanceMethods.push(
          `    public ${fieldTypeString} ${getterMethodName}() {\n` +
          `        ${body};\n` +
          `    }`
        );
        if (!toAccess) {
          const setterMethodName = getMethodName("set" + capitalName, [buildSignatureType(fieldTypeTree)], instanceMethodSignatures);
          const nullCheck = isNullable ? "value == null ? null : " : "";
          instanceMethods.push(
            `    public void ${setterMethodName}(${fieldTypeString} value) {\n` +
            `        this.${fieldName}.set(${nullCheck}${buildUnwrapper(fieldTypeTree).replace("%", "value")});\n` +
            `    }`
          );
        }
      }
    }
  }

  const rInstance = instanceFieldInitializers.length ? "        R.RInstance rInstance = clazz.inst(instance);\n" : "";
  const impl = implementingInterfaces.length ? " implements " + implementingInterfaces.join(", ") : "";

  processedClasses[fullyQualified] = (
    `package ${package};\n` +
    `\n` +
    `import dev.gxlg.multiversion.R;\n` +
    `import net.bytebuddy.implementation.bind.annotation.AllArguments;\n` +
    `import net.bytebuddy.implementation.bind.annotation.FieldValue;\n` +
    `import net.bytebuddy.implementation.bind.annotation.Origin;\n` +
    `import net.bytebuddy.implementation.bind.annotation.RuntimeType;\n` +
    `import net.bytebuddy.implementation.bind.annotation.SuperCall;\n` +
    `import java.lang.reflect.Method;\n` +
    `import java.util.concurrent.Callable;\n` +
    `\n` +
    `public class ${className} extends ${extendingClassString ?? "R.RWrapper<" + className + ">"}${impl} {\n` +
    `    public static final R.RClass clazz = R.clz("${reflectionClassGetter}");\n` +
    `\n` +
    `    private int superCall = 0;\n` +
    `\n` +
    `${instanceFields.join("\n\n")}\n` +
    `\n` +
    `${constructors.join("\n\n")}\n` +
    `\n` +
    `    protected ${className}(Object instance) {\n` +
    `        super(instance);\n` +
    `${rInstance}` +
    `${instanceFieldInitializers.join("\n")}\n` +
    `    }\n` +
    `\n` +
    `${instanceMethods.join("\n\n")}\n` +
    `\n` +
    `    public static ${className} inst(Object instance) {\n` +
    `        return instance == null ? null : new ${className}(instance);\n` +
    `    }\n` +
    `\n` +
    `${staticMethods.join("\n\n")}\n` +
    `\n` +
    `    public static class Interceptor {\n` +
    `        @SuppressWarnings("unused")\n` +
    `        @RuntimeType\n` +
    `        public static Object intercept(@Origin Method method, @FieldValue("__wrapper") ${className} wrapper, @AllArguments Object[] args, @SuperCall Callable<?> superCall) throws Exception {\n` +
    `            if (wrapper.superCall > 0) {\n` +
    `                wrapper.superCall--;\n` +
    `                return superCall.call();\n` +
    `            }\n` +
    `            String methodName = method.getName();\n` +
    `${extendedMethods.join("\n\n")}\n` +
    `            return ${extendingClassString ?? "R.RWrapper"}.Interceptor.intercept(method, wrapper, args, superCall);\n` +
    `        }\n` +
    `    }\n` +
    `}`
  ).replace(/\n[ ]*\n+/g, "\n\n").replace(/\n+([ ]*\})/g, "\n$1");
}

function processInterface(part) {
  const parts = part.parent.slice(9).trimStart().split(/[ ]+/);
  const leftClass = parts.shift();
  const extendingInterfaces = [];
  if (parts[0] == "extends") {
    parts.shift();
    while (parts.length) {
      const c = parts.unshift();
      const tree = typeTree(c, additionalClasses, shortClassNames, true);
      if (tree.type != "wrapper") {
        console.log("Wrapper interface can only extend other Wrapper interfaces!");
        process.exit(1);
      }
      extendingInterfaces.push(buildTypeString(tree));
    }
  }

  // parse class name
  const rGetter = shortClassNames[leftClass] ?? leftClass
  const reflectionClassGetter = rGetter.startsWith("!") ? rGetter.slice(1) : rGetter;
  const fullyQualified = "dev.gxlg.multiversion.gen." + reflectionClassGetter.split("/").slice(-1)[0] + "WrapperInterface";
  if (fullyQualified in processedClasses) {
    return;
  }
  additionalClasses.push({ "parent": "class " + reflectionClassGetter, "children": [] });

  const className = fullyQualified.split(".").slice(-1)[0];
  const wrapperClassName = className.slice(0, -9);
  const package = fullyQualified.split(".").slice(0, -1).join(".");

  // work out the body
  const instanceMethods = [];
  const instanceMethodCallers = [];

  const instanceMethodSignatures = { "wrapper()": 1, "unwrap()": 1 };

  for (const child of part.children) {
    if (child.parent.startsWith("<init>")) {
      // constructor
      console.log("Interfaces can't have constructors!");
      process.exit(1);

    } else if (child.parent.endsWith(")")) {
      // method
      if (child.parent.startsWith("static ")) {
        console.log("Interface wrappers shouldn't have static methods, declare them on the auto-generated class instead!");
        process.exit(1);
      }

      let lineToParse = child.parent;
      const isNullable = lineToParse.startsWith("? ");
      if (isNullable) {
        lineToParse = lineToParse.slice(2);
      }
      const isDefault = lineToParse.startsWith("default ");
      if (isDefault) {
        lineToParse = lineToParse.slice(8);
      }

      if (isNullable && !isDefault) {
        console.log("Declaring interface method signature as nullable is not necessary!");
        process.exit(1);
      }

      const returnTypeIndex = brackets(lineToParse, 0, " ");
      const returnTypeTree = typeTree(lineToParse.slice(0, returnTypeIndex), additionalClasses, shortClassNames);

      const reflectionMethodGetter = lineToParse.slice(returnTypeIndex + 1).trimStart().split("(")[0];
      const argumentsToParse = lineToParse.split("(")[1].slice(0, -1).trim();
      const arguments = [];
      let runner = 0;
      while (runner < argumentsToParse.length) {
        const argumentTypeIndex = brackets(argumentsToParse, runner, " ");
        const argumentTypeTree = typeTree(argumentsToParse.slice(runner, argumentTypeIndex), additionalClasses, shortClassNames);
        const separatorIndex = brackets(argumentsToParse, argumentTypeIndex + 1, ",")
        const argumentName = argumentsToParse.slice(argumentTypeIndex + 1, separatorIndex);
        runner = separatorIndex + 1;
        while (runner < argumentsToParse.length && argumentsToParse[runner] == " ") {
          runner ++;
        }
        arguments.push({ "name": argumentName, "type": argumentTypeTree });
      }

      const rawMethodName = reflectionMethodGetter.split("/").slice(-1)[0];
      const argumentsSignature = arguments.map(a => buildSignatureType(a.type));
      const methodName = getMethodName(rawMethodName, argumentsSignature, instanceMethodSignatures);

      if (isDefault) {
        const methodParent = `${wrapperClassName}.clazz.inst(unwrap())`;
        let body;
        if (isNullable) {
          const exec = `Object __return = ${methodParent}.mthd("${reflectionMethodGetter}", ${buildClassGetter(returnTypeTree)}${arguments.map(a => ", " + buildClassGetter(a.type)).join("")}).invk(${arguments.map(a => buildUnwrapper(a.type).replace("%", a.name)).join(", ")});\n`;
          const returnStatement = `        return __return == null ? null : ${buildWrapper(returnTypeTree).replace("%", "__return")}`;
          body = exec + returnStatement;
        } else {
          const exec = `${methodParent}.mthd("${reflectionMethodGetter}", ${buildClassGetter(returnTypeTree)}${arguments.map(a => ", " + buildClassGetter(a.type)).join("")}).invk(${arguments.map(a => buildUnwrapper(a.type).replace("%", a.name)).join(", ")})`;
          body = returnTypeTree.type == "void" ? exec : `return ${buildWrapper(returnTypeTree).replace("%", exec)}`;
        }
        instanceMethods.push(
          `    default ${buildTypeString(returnTypeTree)} ${methodName}(${arguments.map(a => buildTypeString(a.type) + " " + a.name).join(", ")})\n` +
          `        ${body};\n` +
          `    }`
        );
      } else {
        instanceMethods.push(
          `    ${buildTypeString(returnTypeTree)} ${methodName}(${arguments.map(a => buildTypeString(a.type) + " " + a.name).join(", ")});`
        );
      }

      const exec = `this.${methodName}(${arguments.map((a, i) => buildWrapper(a.type).replace("%", "args[" + i + "]")).join(", ")})`;
      const body = returnTypeTree.type == "void" ? `${exec};\n                    return null` : `return ${buildUnwrapper(returnTypeTree).replace("%", exec)}`;
      instanceMethodCallers.push(
        `                if ((${reflectionMethodGetter.split("/").map(g => "methodName.equals(\"" + g + "\")").join(" || ")}) && R.methodMatches(method, ${buildClassGetter(returnTypeTree)}${arguments.map(a => ", " + buildClassGetter(a.type)).join("")})) {\n` +
        `                    ${body};\n` +
        `                }`
      );

    } else if (child.parent.startsWith("class ") || child.parent.startsWith("interface ")) {
      console.log("Interface wrappers shouldn't have inner classes/interfaces!");
      process.exit(1);

    } else {
      // field
      console.log("Interfaces can't have fields!");
      process.exit(1);
    }
  }

  const ext = extendingInterfaces.length ? ", " + extendingInterfaces.join(", ") : "";
  processedClasses[fullyQualified] = (
    `package ${package};\n` +
    `\n` +
    `import dev.gxlg.multiversion.R;\n` +
    `\n` +
    `import java.lang.reflect.Proxy;\n` +
    `\n` +
    `public interface ${className} extends R.RWrapperInterface<${wrapperClassName}>${ext} {\n` +
    `${instanceMethods.join("\n\n")}\n` +
    `\n` +
    `    default Object unwrap() {\n` +
    `        return null;\n` +
    `    }\n` +
    `\n` +
    `    @Override\n` +
    `    default ${wrapperClassName} wrapper() {\n` +
    `        return ${wrapperClassName}.inst(Proxy.newProxyInstance(\n` +
    `            Thread.currentThread().getContextClassLoader(), new Class[]{ ${wrapperClassName}.clazz.self() }, (proxy, method, args) -> {\n` +
    `                String methodName = method.getName();\n` +
    `${instanceMethodCallers.join("\n\n")}\n` +
    `                return method.invoke(proxy, args);\n` +
    `            }\n` +
    `        ));\n` +
    `    }\n` +
    `}`
  ).replace(/\n[ ]*\n+/g, "\n\n").replace(/\n+([ ]*\})/g, "\n$1");
}

while (classes.length) {
  processClass(classes.shift());
}
while (additionalClasses.length) {
  processClass(additionalClasses.shift());
}

const genRoot = "src/" + root + "/dev/gxlg/multiversion/gen";
if (fs.existsSync(genRoot)) {
  fs.rmSync(genRoot, { "recursive": true });
}
for (const fullyQualified in processedClasses) {
  const fileName = fullyQualified.replace("dev.gxlg.multiversion.gen.", "").replaceAll(".", "/");
  const folder = fileName.split("/").slice(0, -1).join("/");
  fs.mkdirSync(genRoot + "/" + folder, { "recursive": true });
  fs.writeFileSync(genRoot + "/" + fileName + ".java", processedClasses[fullyQualified]);
  console.log("Generated", fullyQualified);
}

console.log("Done generating!");

const adapterRoot = "src/" + root + "/dev/gxlg/multiversion/adapters";
const genericLetters = "STUVWXYZ";
for (const adapter in genericAdapters) {
  const adapterBaseClass = adapter.split("$")[0];
  const fileName = adapter.replaceAll(".", "/");
  const folder = fileName.split("/").slice(0, -1).join("/");
  fs.mkdirSync(adapterRoot + "/" + folder, { "recursive": true });
  const package = "dev.gxlg.multiversion.adapters." + adapter.split(".").slice(0, -1).join(".");
  const baseClassName = adapter.split(".").slice(-1)[0];
  const className = baseClassName + "Adapter";
  const adapterClassName = baseClassName.replaceAll("$", ".");

  const genericArray = [];
  const genericWrappers = [];
  const genericUnwrappers = [];
  const size = genericAdapters[adapter];
  for (let i = 0; i < size; i++) {
    const letter = genericLetters[i];
    genericArray.push(letter);
    genericWrappers.push(`Function<Object, ${letter}> wrapper${letter}`);
    genericUnwrappers.push(`Function<${letter}, Object> unwrapper${letter}`);
  }
  const generics = genericArray.join(", ");

  if (!fs.existsSync(adapterRoot + "/" + fileName + "Adapter.java") || fs.readFileSync(adapterRoot + "/" + fileName + "Adapter.java", "utf-8").includes("TODO: implement")) {
    console.log("Please implement the adapter at", "dev.gxlg.multiversion.adapters." + adapter + "Adapter");
    fs.writeFileSync(
      adapterRoot + "/" + fileName + "Adapter.java",
      `package ${package};\n` +
      `\n` +
      `import ${adapterBaseClass};\n` +
      `import java.util.function.Function;\n` +
      `\n` +
      `public class ${className} {\n` +
      `    public static <${generics}> Function<Object, ${adapterClassName}<${generics}>> wrapper(${genericWrappers.join(", ")}) {\n` +
      `        // TODO: implement\n` +
      `        // return object -> ${baseClassName.toLowerCase()};\n` +
      `    }\n` +
      `\n` +
      `    public static <${generics}> Function<${adapterClassName}<${generics}>, Object> unwrapper(${genericUnwrappers.join(", ")}) {\n` +
      `        // TODO: implement\n` +
      `        // return ${baseClassName.toLowerCase()} -> object;\n` +
      `    }\n` +
      `}\n`
    );
  }
}
