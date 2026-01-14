() => {
  const generics = [];
  if (type.endsWith(">")) {
    // then it's a generic type!
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
          gens.push(type.slice(last + 1, runner));
        }
      } else if (char == "," && counter == 1) {
        gens.push(type.slice(last + 1, runner));
        last = runner;
      }
    }
    type = type.slice(0, start);
    gens.forEach(g => {
      const { finalType, generic } = parseType(g);
      generics.push(finalType + generic);
    });
  }
  const generic = generics.length ? "<" + generics.join(", ") + ">" : "";
};
