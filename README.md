# MultiVersion

<img src="/multi.svg" height="64px" align="left">
<span align="right">
  Write a single Fabric mod for multiple Minecraft versions<br><br>
  <img src="/badges/minecraft.svg" height="24px"> <img src="/badges/fabric.svg" height="24px"> <img src="/badges/gradle.svg" height="24px">
</span>

<hr>

> [!WARNING]  
> Still in development

<hr>

# How is this possible?

**Q**: Minecraft code base is constantly changing, so how is it possible to write a single mod for different Minecraft versions?<br>
**A**: You can write version-dependent code in a _single function_, which is branched based on the running Minecraft version

**Q**: But what if classes from older versions get removed, renamed or their mapping is changed?<br>
**A**: That's where MultiVersion's _preprocessing_ comes in!

## The power of Reflection
...
