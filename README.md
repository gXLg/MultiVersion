# MultiVersion

<img src="/multi.svg" height="64px" align="left">
<span align="right">
  Write a single Fabric mod for multiple Minecraft versions<br><br>
  <img src="/badges/minecraft.svg" height="24px"> <img src="/badges/fabric.svg" height="24px"> <img src="/badges/gradle.svg" height="24px">
</span>

<hr>

> [!WARNING]
> Work in progress

# How is this possible?

**Q**: Minecraft code base is constantly changing, so how is it possible to write a single mod for different Minecraft versions?<br>
**A**: You can write version-dependent code in a _single function_, which is branched based on the running Minecraft version

**Q**: But what if classes from older versions get removed, renamed or their mapping is changed?<br>
**A**: That's where MultiVersion's _reflection wrapper_ comes in!

**Version Filtering**<br>
Run different code depending on which Minecraft version is currently being used. Simply use a provided stub function and the preprocessor will turn it into
fully working Java code.

**The Power of Reflection**<br>
Executing code at runtime, which is not available at compile time?
Java's most powerful tool - Reflection, - makes it possible!
And the _powerful_ wrapper allows you to write very simple code aimed directly at Reflection for Minecraft.

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
class Example {
    void method() {
      if (V.higher("1.18")) { // > 1.18
        // ...
      }
      if (!V.higher("1.21.5")) { // <= 1.21.5
        // ...
      }
      if (V.equal("1.19.3")) { // == 1.19.3
        // ...
      }
    }
}
```
7. To use Reflection-based code, follow the next paragraph

# Reflection Wrapper
This section is work in progress and the underlying mechanism is constantly evolving.

The previous Reflection-Sugar-Language idea has been scrapped and now a new approach is used.

# About Me
I am a computer science student in Germany and have a part-time job at a tech company.
Apart from that, I enjoy my free time by spending it with friends, chatting online or gaming.

If you want to keep this project alive, found it helpful or just want to support and motivate me to go on,
you could consider making a small [<kbd>☕ donation</kbd>](https://www.paypal.com/donate?hosted_button_id=DVC2UQP2AXR68).

---

NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
