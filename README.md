# MultiVersion

<img src="/multi.svg" height="64px" align="left">
<span align="right">
  Write a single Fabric mod for multiple Minecraft versions<br><br>
  <img src="/badges/minecraft.svg" height="24px"> <img src="/badges/fabric.svg" height="24px"> <img src="/badges/gradle.svg" height="24px">
</span>

<hr>

# How is this possible?

**Q**: Minecraft code base is constantly changing, so how is it possible to write a single mod for different Minecraft versions?<br>
**A**: You can write version-dependent code in a _single function_, which is branched based on the running Minecraft version

**Q**: But what if classes from older versions get removed, renamed or their mapping is changed?<br>
**A**: That's where MultiVersion's _preprocessing_ comes in!

**Version Filtering**<br>
Run different code depending on which Minecraft version is currently being used. Simply use a provided stub function and the preprocessor will turn it into
fully working Java code.

**The Power of Reflection**<br>
Executing code at runtime, which is not available at compile time?
Java's most powerful tool - Reflection, - makes it possible!
And the _powerful_ preprocessor allows you to write very simple code aimed directly at Reflection for Minecraft.

By combining both of these strategies, you can easily manage multiple Minecraft versions in a single project,
no matter how much the API changes.

# Usage
1. Install `Node.js`
2. Download the repository to the root of your project, either clone it directly:
```
git clone https://github.com/gXLg/MultiVersion
```
or add it as a submodule:
```
git submodule add https://github.com/gXLg/MultiVersion
```
3. Create a config file `multi-version.json` with following content:
```json
{
    "root": "the path to the root of your source code inside `src`, e.g. `main/java/com/gxlg/example`",
    "package": "packge name of your project, e.g. `com.gxlg.example`"
}
```
4. run `node MultiVersion` - this will include an `apply` command in your `build.gradle` to import MultiVersion's configs and create a stub `Reflection.java` file
5. Write your code.
6. Whenever you want to write version dependent code, just write, e.g.:
```java
if (Reflection.version(">= 1.18")) {
    ...
}
if (Reflection.version("< 1.21.5")) {
    ...
}
if (Reflection.version("= 1.19.3")) {
    ...
}
```
7. To use Reflection-based code, follow the next paragraph

# Reflection Sugar Language (RSL)
First you have to understand, that Mojang uses different class, method and field names when releasing the game.
The names are all seemingly random and are non-intuitive, like `aq`, `kf()` or `Rt`.
Not only are they chaotic, but they also keep changing between even two small releases.

It's all thanks to Fabric, that we can use proper and understandable names during development.
But there's one more layer between Mojang's official naming system and the one we use in our projects.
The names there are not intuitive as well, but at least they follow a pattern and remain consistent between releases,
unless their signature changed.

This system consists of names such as `method_42()`, `field_13` and `class_37`. In newer versions of Minecraft, Mojang started using records,
so there also exist components in form of `comp_123`.

The basic idea of RSL is to use this knowledge to create an intuitive, flexible and robust system to use Reflection in Minecraft modding.
While writing code, whenever you need to embed RSL, use the provided wrapper:
```java
Reflection.wrap("your RSL code goes in here")
```
Since the wrapper stub returns `Object`, but you may want to receive a specific Object, you will have to cast the return value outside of the wrapper, so that your IDE highlights it correctly.

When your users will run your mod, their environment will have the intermediary layer naming (`method_42()` etc.).
But during the development in an IDE, your environment is most likely to use Fabric's naming system.
Therefore for better readability and for easier debugging, I recommend you to use both naming systems with the RSL.
Such a case is already implemented and is considered best practice.

## Syntax
The syntax tree of the language is rather simple. It consists of 4 main types:
* Tokens - strings and names
* Pairs - pairs of class (left) and value (right) separated by `:`
* Lists - a list of multiple Tokens, list items are separated by `/`
* Brackets - a list of different subtrees separated by whitespace, transforming into code, depending on which type of subtrees there are, Brackets are denoted as `[]`

## Transformation
When in comes to transformation, the nodes of the tree are being traversed and processed with awareness to context.
There are multiple types of pre-transformation nodes:
* Simple Tokens - Tokens which can have different interpretation based on how they are used
  * When a Bracket is being transformed it also returns a Simple Token, which is why the term "token" may be a bit confusing;
    here "token" simply means "a single information unit, which can't be further broken down"
* Class Tokens - special Tokens, which have their first letter uppercased, indicating that a Java class is being referenced
  * There are two possiblities to create Class Tokens - either by having a Token with its first letter being capitalized, a Token equal to one of Java primitives (e.g. `int`, `boolean` etc.) or a List of Tokens, one of which is in form `net.minecraft.class_123`
  * Class Tokens created from capitalized Tokens nad primitives get `.class` appended during transformation
* Typed Values - transformed Pairs; after all verification and transformation made on both the left and the right element, they both must be either a Simple Token or a Class Token
  * Another possibility to create Typed Values are so-called Self-Typed Values, which are regular Tokens annotated by `@`; the resulting class will be `(tokne).getClass()`
  * Only use Self-Typed Values when dealing with non-primitives and objects of non-inherited classes
* Lists:
  * Method List - a List of Tokens, one of which is in form `method_123`
  * Field List - a List of Tokens, one of which is in form `field_123`
  * Component List - a List of Token, one of which is in form `comp_123`; their behaviour is identical to Field Lists,
    but since the Reflection syntax for getting components differs from the one used by fields, they have a separate type
* Expressions - Brackets which transform into a final Simple Token, based on which type of expression is used
  * Method Expression - expression of calling a method; Bracket signature: `[TypedValue(1) MethodList(2) ...TypedValue(3)]`
    * `1` - The instance we are calling the method on with the respective class, e.g. `VillagerData:villagerData` or static `MinecraftClient:null`
    * `2` - List of methods to search for, e.g. `method_40225/matchesKey`
    * `3` - Arguments as Typed Values, the typing is required to find the correct method using Reflection
  * Get Field/Component Expressions - expression of getting a field/component value from an Object; Bracket signature: `[TypedValue(1) <FieldList or ComponentList>(2)]`
    * `1` - The instance with the class
    * `2` - List of fields/components to search
  * Set Field Expressions - expression of setting a field value in an Object; since records are final,
    having a setter for components makes no sense; Bracket signature: `[TypedValue(1) FieldList(2) <SimpleToken or ClassToken>(3)]`
    * `1` - The instance with the class
    * `2` - List of fields to search
    * `3` - The value to set
  * Class Expression - expression of finding a Java class; Bracket signature: `[ClassToken(1)]`
    * `1` - Either a standalone class generated from a Token like `VillagerData` or a List of classnames to search for like `net.minecraft.class_6880/net.minecraft.registry.entry.RegistryEntry`;
      although it is possible to have a single Token inside brackets, I recommend to just leave the brackets out in this case; brackets around List of classnames are required though
  * Construct Expression - expression of constructing a new Object in Java; Bracket signature: `[ClassToken(1) ...TypedValue(2)]`
    * `1` - Same as in Class Expression
    * `2` - Same as `3` in Method Expression

It is possible to nest Brackets and some elements even require Brackets to be parsed correctly.
While the outermost layer is processed as a Bracket itself, its inner elements may require bracketing.
**Typed Values** can only be created with Simple Tokens or Class Tokens, so if the left or the right side of the `:`-sign
is a nested expression or a List of Tokens, Brackets must be used.

A transformed List can only be created from Tokens, so you can't use Pairs or Brackets as List elements.

# Examples
Some code examples from my testing.

This is a snippet from [LibrGetter](https://github.com/gXLg/libr-getter), using (almost) all of different Expression types, which was used to design the architecture:
```java
public static boolean isVillagerLibrarian(VillagerEntity villager) {
    VillagerData villagerData = villager.getVillagerData();
    Object lib = Reflection.wrap("[net.minecraft.class_3852/net.minecraft.village.VillagerProfession]:null field_17060/LIBRARIAN");
    if (Reflection.version(">= 1.21.5")) {
        return (boolean) Reflection.wrap("[net.minecraft.class_6880/net.minecraft.registry.entry.RegistryEntry]:[VillagerData:villagerData comp_3521/profession] method_40225/matchesKey [net.minecraft.class_5321/net.minecraft.registry.RegistryKey]:lib");
        // same as (without Reflection, when compile version == run version):
        // return villagerData.profession().matchesKey(lib);
    } else {
        return Reflection.wrap("VillagerData:villagerData method_16924/getProfession").equals(lib);
    }
}
```

Here are two ways to run a version-specific comparison.
The first is taken from [Vault Manager](https://github.com/gXLg/vault-manager) during development and testing of MultiVersion:
```java
public static boolean wasKeyUsed(ActionResult result) {
    if (Reflection.version(">= 1.21.2")) {
        return result == Reflection.wrap("ActionResult:null field_52422/SUCCESS_SERVER");
    } else {
        return result == Reflection.wrap("ActionResult:null field_21466/CONSUME");
    }
}
```
The second variant can be found in LibrGetter's code. Although the intermediary name didn't change between releases, Fabric's naming did, and so we avoid the mismatch using:
```java
public static ItemStack getFirstBuyItem(TradeOffer offer) {
    return (ItemStack) Reflection.wrap("TradeOffer:offer method_19272/getAdjustedFirstBuyItem/getDisplayedFirstBuyItem");
}
```

# About Me
I am a computer science student in Germany and have a part-time job at a tech company.
Apart from that, I enjoy my free time by spending it with friends, chatting online or gaming.

If you want to keep this project alive, found it helpful or just want to support and motivate me to go on,
you could consider making a small [<kbd>☕ donation</kbd>](https://www.paypal.com/donate?hosted_button_id=DVC2UQP2AXR68).

---

NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
