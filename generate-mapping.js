const fs = require("fs");
const { root, package } = JSON.parse(fs.readFileSync("./multi-version.json", "utf-8"));
const finalPackage = package + ".multiversion.gen";
const file = fs.readFileSync("src/" + root + "/multiversion/multi-version.mapping", "utf-8").trim();

if (file === "") {
  console.log("Nothing to generate!");
  process.exit(0);
}

const classes = file.split(/\n\n+/).map(p => {
  const [clz, ...methods] = p.split("\n").map(l => l.trim());
  return { clz, methods };
});

// fileName: classGetter, instanceMethods, staticMethods, instanceFields, extending, constructors
const processedClasses = {};

function parseType(type) {
  let finalType;
  let castLeft;
  let castRight;
  let classGetter;
  let returnStatement;
  if (type.includes("/")) {
    classes.push({ "clz": type, "methods": [] });
    finalType = finalPackage + "." + type.split("/").slice(-1)[0] + "Wrapper";
    castLeft = finalType + ".inst(";
    castRight = ")";
    classGetter = "clazz";
    returnStatement = "return ";
  } else {
    finalType = type;
    castLeft = (type === "Object" || type === "void") ? "" : "(" + type + ") ";
    castRight = "";
    classGetter = "class";
    returnStatement = type === "void" ? "" : "return "
  }
  return { finalType, castLeft, castRight, classGetter, returnStatement };
}

while (classes.length) {
  const { clz, methods } = classes.shift();

  const [currentClass, extendingClass] = clz.includes(" extends ") ? clz.split(" extends ") : [clz, null];
  let extending = null;
  if (extendingClass != null) {
    const { finalType } = parseType(extendingClass);
    extending = finalType;
  }

  const classNames = currentClass.split("/");
  const fileName = classNames.slice(-1)[0].replaceAll(".", "/") + "Wrapper";
  if (fileName in processedClasses) continue;

  const instanceMethods = [];
  const staticMethods = [];
  const instanceFields = [];
  const instanceFieldsInits = [];
  const constructors = [];

  for (const method of methods) {
    const isStatic = method.startsWith("static ");

    if (!method.endsWith(")")) {
      // then it's a field!
      const names = method.split(" ").slice(-1)[0];
      const pubName = names.split("/").slice(-1)[0];

      const returnType = method.split(" ")[isStatic ? 1 : 0];
      const { finalType, castLeft, castRight } = parseType(returnType);

      if (isStatic) {
        staticMethods.push(
`    public static ${finalType} ${pubName}() {
        return ${castLeft}clazz.fld("${names}").get()${castRight};
    }
`
        );
      } else {
        instanceFields.push(`    private final R.RField ${pubName};`);
        instanceFieldsInits.push(`        this.${pubName} = this.instance.fld("${names}");`);
        const capName = pubName.slice(0, 1).toUpperCase() + pubName.slice(1);
        instanceMethods.push(
`    public ${finalType} get${capName}() {
        return ${castLeft}this.${pubName}.get()${castRight};
    }

    public void set${capName}(${finalType} value) {
        this.${pubName}.set(value);
    }`
        );
      }
      continue;
    }

    const rawArgs = method.split("(")[1].split(")")[0];
    const args = rawArgs === "" ? [] : rawArgs.split(", ").map(a => a.split(" "));
    const finalArgs = [];
    const finalTypes = [];
    const finalNames = [];
    for (const [type, name] of args) {
      const { finalType, classGetter } = parseType(type);
      finalArgs.push(finalType + " " + name);
      finalTypes.push(finalType + "." + classGetter);
      finalNames.push(name);
    }

    if (method.startsWith("<init>")) {
      // then it's a constructor!
      constructors.push(
`    <init>(${finalArgs.join(", ")}) {
        this(clazz.constr(${finalTypes.join(", ")}).newInst(${finalNames.join(", ")}).self())
    }`
      );

      continue;
    }

    const returnType = method.split(" ")[isStatic ? 1 : 0];
    const { finalType, castLeft, castRight, returnStatement } = parseType(returnType);

    const methodNames = method.split("(")[0].split(" ").slice(-1)[0];
    const fileMethodName = methodNames.split("/").slice(-1)[0];

    (isStatic ? staticMethods : instanceMethods).push(
`    public ${isStatic ? "static " : ""}${finalType} ${fileMethodName}(${finalArgs.join(", ")}) {
         ${returnStatement}${castLeft}${isStatic ? "clazz" : "instance"}.mthd("${methodNames}"${finalTypes.map(t => ", " + t).join("")}).invk(${finalNames.join(", ")})${castRight};
    }`
    );
  }

  processedClasses[fileName] = { "classGetter": currentClass, instanceMethods, staticMethods, instanceFields, instanceFieldsInits, extending, constructors };
}

const genRoot = "src/" + root + "/multiversion/gen";
if (fs.existsSync(genRoot)) {
  fs.rmSync(genRoot, { "recursive": true });
}
for (const fileName in processedClasses) {
  const folder = fileName.split("/").slice(0, -1).join("/");
  fs.mkdirSync(genRoot + "/" + folder, { "recursive": true });
  const className = fileName.split("/").slice(-1)[0];
  const { classGetter, instanceMethods, staticMethods, instanceFields, instanceFieldsInits, extending, constructors } = processedClasses[fileName];
  fs.writeFileSync(genRoot + "/" + fileName + ".java",
`package ${finalPackage}.${fileName.split("/").slice(0, -1).join(".")};

import ${package}.multiversion.R;

public class ${className} extends ${extending ?? "R.RWrapper"} {
    public static final R.RClass clazz = R.clz("${classGetter}");

${instanceFields.join("\n\n")}

${constructors.map(c => c.replace("<init>", className)).join("\n\n")}

    protected ${className}(Object instance) {
        super(${extending ? "instance" : "clazz.inst(instance)"});
${instanceFieldsInits.join("\n")}
    }

${instanceMethods.join("\n\n")}

    public static ${className} inst(Object instance) {
        return new ${className}(instance);
    }

${staticMethods.join("\n\n")}
}
`.replace(/\n\n+/g, "\n\n")
  );
  console.log("Generated", className);
}

console.log("Done!");
