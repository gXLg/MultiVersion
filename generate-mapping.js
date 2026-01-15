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

function typeTree(type, additionalClasses) {
  if (type.endsWith("[]")) {
    const main = typeTree(type.slice(0, -2), additionalClasses);
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
    const main = type.slice(0, start);
    const generics = gens.map(g => typeTree(g, additionalClasses));
    return { "type": "generic", main, generics, "wrapped": generics.some(g => g.wrapped), "generic": true };
  }
  if (type.includes("/") || type.startsWith("!")) {
    let actualType = type;
    if (type.startsWith("!")) {
      actualType = type.slice(1);
    }
    const main = "dev.gxlg.multiversion.gen." + actualType.split("/").slice(-1)[0] + "Wrapper";
    additionalClasses.push({ "parent": type, "children": [] });
    return { "type": "wrapper", main, "wrapped": true, "generic": false };
  }
  if (type == "void") {
    return { "type": "void", "wrapped": false, "generic": false };
  }
  if (type == "Object") {
    return { "type": "object", "wrapped": false, "generic": false };
  }
  return { "type": "java", "main": type, "wrapped": false, "generic": false };
}

function buildTypeString(tree) {
  const { type, main, generics } = tree;
  if (type == "array") {
    return buildTypeString(main) + "[]";
  }
  if (type == "generic") {
    return main + "<" + generics.map(g => buildTypeString(g)).join(", ") + ">";
  }
  return main;
}

function buildClassGetter(tree) {
  const { type, main } = tree;
  if (type == "array") {
    return buildClassGetter(main) + ".arrayType()";
  }
  if (type == "wrapper") {
    return main + ".clazz";
  }
  return main + ".class";
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
    return `x -> ${main}.inst(x)`;
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
    return `R.arrayUnwrapper(${_buildUnwrapper(main)}).apply(%)`;
  } else if (type == "generic") {
    genericAdapters[main] = generics.length;
    return `dev.gxlg.multiversion.adapters.${main}Adapter.unwrapper(${generics.map(_buildUnwrapper).join(", ")}).apply(%)`;
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
    return `x -> x.unwrap()`;
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

const lines = file.split("\n").filter(l => !l.startsWith("#") && l.trim().length);
const classes = [];
const additionalClasses = [];
const genericAdapters = {};
processPart(classes, lines);

// fileName: content
const processedClasses = {};

function processClass(part) {
  // parse extensions
  const [leftClass, rightClass] = part.parent.includes(" extends ") ? part.parent.split(" extends ") : [part.parent, null];
  let extendingClassString = null;
  if (rightClass != null) {
    const tree = typeTree(rightClass, additionalClasses);
    if (tree.type != "wrapper") {
      console.log("Wrapper class can only extend other Wrapper classes!");
      process.exit(1);
    }
    extendingClassString = buildTypeString(tree);
  }

  // parse class name
  const reflectionClassGetter = leftClass;
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
  const instanceMethodSignatures = { "unwrap()": 1, "unwrap(Class)": 1, "downcast(Class)": 1, "isNull()": 1 };
  const staticMethodSignatures = { "inst(Object)": 1 };

  for (const child of part.children) {
    if (child.parent.startsWith("<init>")) {
      // constructor
      const argumentsToParse = child.parent.split("(")[1].slice(0, -1).trim();
      const arguments = [];
      let runner = 0;
      while (runner < argumentsToParse.length) {
        const argumentTypeIndex = brackets(argumentsToParse, runner, " ");
        const argumentTypeTree = typeTree(argumentsToParse.slice(runner, argumentTypeIndex), additionalClasses);
        const separatorIndex = brackets(argumentsToParse, argumentTypeIndex + 1, ",")
        const argumentName = argumentsToParse.slice(argumentTypeIndex + 1, separatorIndex);
        runner = separatorIndex + 1;

        arguments.push({ "name": argumentName, "type": argumentTypeTree });
      }

      constructors.push(
        `    public ${className}(${arguments.map(a => buildTypeString(a.type) + " " + a.name).join(", ")}){\n` +
        `        this(clazz.constr(${arguments.map(a => buildClassGetter(a.type)).join(", ")}).newInst(${arguments.map(a => buildUnwrapper(a.type).replace("%", a.name)).join(", ")}).self());\n` +
        `    }`
      );

    } else if (child.parent.endsWith(")")) {
      // method
      const isStatic = child.parent.startsWith("static ");
      const signatures = isStatic ? staticMethodSignatures : instanceMethodSignatures;
      const lineToParse = isStatic ? child.parent.slice(6).trimStart() : child.parent;

      const returnTypeIndex = brackets(lineToParse, 0, " ");
      const returnTypeTree = typeTree(lineToParse.slice(0, returnTypeIndex), additionalClasses);

      const reflectionMethodGetter = lineToParse.slice(returnTypeIndex + 1).trimStart().split("(")[0];
      const argumentsToParse = lineToParse.split("(")[1].slice(0, -1).trim();
      const arguments = [];
      let runner = 0;
      while (runner < argumentsToParse.length) {
        const argumentTypeIndex = brackets(argumentsToParse, runner, " ");
        const argumentTypeTree = typeTree(argumentsToParse.slice(runner, argumentTypeIndex), additionalClasses);
        const separatorIndex = brackets(argumentsToParse, argumentTypeIndex + 1, ",")
        const argumentName = argumentsToParse.slice(argumentTypeIndex + 1, separatorIndex);
        runner = separatorIndex + 1;

        arguments.push({ "name": argumentName, "type": argumentTypeTree });
      }

      const rawMethodName = reflectionMethodGetter.split("/").slice(-1)[0];
      const argumentsSignature = arguments.map(a => buildSignatureType(a.type));
      const methodName = getMethodName(rawMethodName, argumentsSignature, signatures);

      const returnStatement = returnTypeTree.type == "void" ? "" : "return ";
      const methodParent = isStatic ? "this.instance" : "clazz";
      const methodsArray = isStatic ? staticMethods : instanceMethods;
      const modifier = isStatic ? "static " : "";
      const exec = `${methodParent}.mthd("${reflectionMethodGetter}"${arguments.map(a => ", " + buildClassGetter(a.type)).join("")}).invk(${arguments.map(a => buildUnwrapper(a.type).replace("%", a.name)).join(", ")})`;
      methodsArray.push(
        `    public ${modifier}${buildTypeString(returnTypeTree)} ${methodName}(${arguments.map(a => buildTypeString(a.type) + " " + a.name).join(", ")}){\n` +
        `        ${returnStatement}${buildWrapper(returnTypeTree).replace("%", exec)};\n` +
        `    }`
      );

    } else if (child.parent.includes(" extends ") || child.parent.split(" ").length == 1) {
      // class
      classes.push(child);

    } else {
      // field
      const isStatic = child.parent.startsWith("static ");
      const lineToParse = isStatic ? child.parent.slice(6).trimStart() : child.parent;

      const fieldTypeIndex = brackets(lineToParse, 0, " ");
      const fieldTypeTree = typeTree(lineToParse.slice(0, fieldTypeIndex), additionalClasses);

      const reflectionFieldGetter = lineToParse.slice(fieldTypeIndex + 1).trim();
      const fieldName = reflectionFieldGetter.split("/").slice(-1)[0];

      if (isStatic) {
        const fieldMethodName = getMethodName(fieldName, [], staticMethodSignatures);
        const exec = `clazz.fld("${reflectionFieldGetter}").get()`;
        staticMethods.push(
          `    public static ${buildTypeString(fieldTypeTree)} ${fieldMethodName}() {\n` +
          `        return ${buildWrapper(fieldTypeTree).replace("%", exec)};\n` +
          `    }`
        );

      } else {
        instanceFields.push(`    private final R.RField ${fieldName};`);
        instanceFieldInitializers.push(`        this.${fieldName} = this.instance.fld("${reflectionFieldGetter}");`);

        const capitalName = fieldName.slice(0, 1).toUpperCase() + fieldName.slice(1);
        const getMethodName = getMethodName("get" + capitalName, [], instanceMethodSignatures);
        const setMethodName = getMethodName("set" + capitalName, [buildSignatureType(fieldTypeTree)], instanceMethodSignatures);
        const fieldTypeString = buildTypeString(fieldTypeTree);

        instanceMethods.push(
          `    public ${fieldTypeString} ${getMethodName}() {\n` +
          `        return ${buildWrapper(fieldTypeTree).replace("%", "this." + fieldName + ".get()")};\n` +
          `    }\n` +
          `    \n` +
          `    public void ${setMethodName}(${fieldTypeString} value) {\n` +
          `        this.${fieldName}.set(${buildUnwrapper(fieldTypeTree).replace("%", "value")});\n` +
          `    }`
        );
      }
    }

    processedClasses[fullyQualified] = (
      `package ${package};\n` +
      `\n` +
      `import dev.gxlg.multiversion.R;\n` +
      `\n` +
      `public class ${className} extends ${extendingClassString ?? "R.RWrapper<" + className + ">"} {\n` +
      `    public static final R.RClass clazz = R.clz("${reflectionClassGetter}");\n` +
      `\n` +
      `${instanceFields.join("\n\n")}\n` +
      `\n` +
      `${constructors.join("\n\n")}\n` +
      `\n` +
      `    protected ${className}(Object instance) {\n` +
      `        super(${extendingClassString ? "instance" : "clazz.inst(instance)"});\n` +
      `${instanceFieldInitializers.join("\n")}\n` +
      `    }\n` +
      `\n` +
      `${instanceMethods.join("\n\n")}\n` +
      `\n` +
      `    public static ${className} inst(Object instance) {\n` +
      `        return new ${className}(instance);\n` +
      `    }\n` +
      `\n` +
      `${staticMethods.join("\n\n")}\n` +
      `}`
    ).replace(/\n\n+/g, "\n\n").replace(/\n+([ ]*\})/g, "\n$1");
  }
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
  const fileName = adapter.replaceAll(".", "/");
  const folder = fileName.split("/").slice(0, -1).join("/");
  fs.mkdirSync(adapterRoot + "/" + folder, { "recursive": true });
  const package = "dev.gxlg.multiversion.adapters." + adapter.split(".").slice(0, -1).join(".");
  const baseClassName = adapter.split(".").slice(-1)[0];
  const className = baseClassName + "Adapter";

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

  if (!fs.existsSync(adapterRoot + "/" + file + "Adapter.java") || fs.readFileSync(adaptersRoot + "/" + file + "Adapter.java", "utf-8").includes("TODO: implement")) {
    console.log("Please implement the adapter at", "dev.gxlg.multiversion.adapters." + adapter + "Adapter");
    fs.writeFileSync(
      adapterRoot + "/" + file + "Adapter.java",
      `package ${package};\n` +
      `\n` +
      `import ${adapter}\n` +
      `import java.util.function.Function;\n` +
      `\n` +
      `public class ${className} {\n` +
      `    public static <${generics}> Function<?, ${baseClassName}<${generics}>> wrapper(${genericWrappers.join(", ")}) {\n` +
      `        // TODO: implement\n` +
      `        // return object -> ${baseClassName.toLowerCase()};\n` +
      `    }\n` +
      `\n` +
      `    public static <${generics}> Function<${baseClassName}<${generics}>, ?> unwrapper(${genericUnwrappers.join(", ")}) {\n` +
      `        // TODO: implement\n` +
      `        // return ${baseClassName.toLowerCase()} -> object;\n` +
      `    }\n` +
      `}\n`
    );
  }
}
