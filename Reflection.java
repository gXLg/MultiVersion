import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Arrays;

@SuppressWarnings({"SameParameterValue", "unused"})
public class Reflection {
    public static Object construct(Class<?> clazz, Object[] args, Class<?>... params) {
        try {
            Constructor<?> con = clazz.getConstructor(params);
            return con.newInstance(args);
        } catch (NoSuchMethodException | InvocationTargetException | InstantiationException |
                 IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }

    public static Method method(Class<?> clazz, Class<?>[] args, String... methods) {
        for (String method : methods) {
            try {
                return clazz.getMethod(method, args);
            } catch (NoSuchMethodException ignored) {
            }
        }

        throw new RuntimeException("method not found from " + Arrays.toString(methods) + " for class " + clazz.getName() + " with args " + Arrays.toString(args));
    }

    public static Object invokeMethod(Class<?> clazz, Object instance, Object[] args, String... methods) {
        if (args == null) args = new Object[0];

        Class<?>[] search = new Class<?>[args.length];
        for (int i = 0; i < args.length; i++) search[i] = args[i].getClass();

        return invokeMethod(clazz, instance, args, search, methods);
    }

    public static Object invokeMethod(Class<?> clazz, Object instance, Object[] args, Class<?>[] search, String... methods) {
        if (args == null) args = new Object[0];
        if (search == null) search = new Class<?>[0];

        Method method = method(clazz, search, methods);
        try {
            return method.invoke(instance, args);
        } catch (InvocationTargetException | IllegalAccessException | NoSuchMethodError e) {
            throw new RuntimeException(e);
        }
    }

    public static Class<?> clazz(String... classes) {
        for (String clazz : classes) {
            try {
                return Thread.currentThread().getContextClassLoader().loadClass(clazz);
            } catch (ClassNotFoundException ignored) {
            }
        }
        throw new RuntimeException("Class not found from " + Arrays.toString(classes));
    }

    public static Object field(Class<?> clazz, Object instance, String... fields) {
        for (String field : fields) {
            try {
                Field f = clazz.getField(field);
                return f.get(instance);
            } catch (NoSuchFieldException | IllegalAccessException ignored) {
            }
        }
        throw new RuntimeException("Field not found from " + Arrays.toString(fields));
    }

    public static void setField(Class<?> clazz, Object instance, Object value, String... fields) {
        for (String field : fields) {
            try {
                Field f = clazz.getField(field);
                f.set(instance, value);
                return;
            } catch (NoSuchFieldException | IllegalAccessException ignored) {
            }
        }
        throw new RuntimeException("Field not found from " + Arrays.toString(fields));
    }

    public static MinecraftVersion getVersion() {
        Class<?> clazzGameVersion = Reflection.clazz("com.mojang.bridge.game.GameVersion", "net.minecraft.class_6489", "net.minecraft.GameVersion");
        Class<?> clazzConstants = SharedConstants.class;
        Object gameVersion = Reflection.invokeMethod(clazzConstants, null, null, "method_16673", "getGameVersion");
        try {
            return new MinecraftVersion((String) Reflection.invokeMethod(clazzGameVersion, gameVersion, null, "method_48019", "getName"));
        } catch (Exception ignored) {
            return new MinecraftVersion((String) Reflection.invokeMethod(clazzGameVersion, gameVersion, null, "comp_4025", "name"));
        }
    }

    public static class MinecraftVersion implements Comparable<MinecraftVersion> {
        private final int major;
        private final int minor;
        private final int patch;

        public MinecraftVersion(String version) {
            String[] mainParts = version.split("-", 2);
            String[] nums = mainParts[0].split("\\.");
            this.major = nums.length > 0 ? Integer.parseInt(nums[0]) : 0;
            this.minor = nums.length > 1 ? Integer.parseInt(nums[1]) : 0;
            this.patch = nums.length > 2 ? Integer.parseInt(nums[2]) : 0;
        }

        @Override
        public int compareTo(MinecraftVersion other) {
            if (this.major != other.major) return Integer.compare(this.major, other.major);
            if (this.minor != other.minor) return Integer.compare(this.minor, other.minor);
            return Integer.compare(this.patch, other.patch);
        }

        public boolean higher(MinecraftVersion other) {
            return this.compareTo(other) > 0;
        }

        public boolean lower(MinecraftVersion other) {
            return this.compareTo(other) < 0;
        }

        public boolean equals(MinecraftVersion other) {
            return this.compareTo(other) == 0;
        }

        @Override
        public String toString() {
            return major + "." + minor + "." + patch;
        }
    }
}
