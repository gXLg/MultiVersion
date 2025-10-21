import net.minecraft.SharedConstants;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;

@SuppressWarnings({"SameParameterValue", "unused"})
public class Reflection {
    private static final Map<Integer, Class<?>> clazzCache = new HashMap<>();
    private static final Map<Integer, Constructor<?>> constructorsCache = new HashMap<>();
    private static final Map<Integer, Method> methodsCache = new HashMap<>();
    private static final Map<Integer, Field> fieldsCache = new HashMap<>();

    private static <T> T cache(Map<Integer, T> cache, Object base, Object[] lookup, Supplier<T> supplier) {
        return cache.computeIfAbsent(Objects.hash(base, Arrays.hashCode(lookup)), i -> supplier.get());
    }

    public static Class<?> clazz(String... classes) {
        return cache(clazzCache, null, classes, () -> {
            for (String clazz : classes) {
                try {
                    return Thread.currentThread().getContextClassLoader().loadClass(clazz);
                } catch (ClassNotFoundException ignored) {
                }
            }
            throw new RuntimeException("Class not found from " + Arrays.toString(classes));
        });
    }

    public static Constructor<?> constructor(Class<?> clazz, Class<?>... params) {
        return cache(constructorsCache, clazz, params, () -> {
            try {
                return clazz.getConstructor(params);
            } catch (NoSuchMethodException e) {
                throw new RuntimeException("Constructor not found for class " + clazz.getName() + " with args " + Arrays.toString(params));
            }
        });
    }

    public static Object constructTyped(Class<?> clazz, Object[] args, Class<?>... params) {
        if (args == null) args = new Object[0];
        if (params == null) params = new Class<?>[0];
        try {
            Constructor<?> con = constructor(clazz, params);
            return con.newInstance(args);
        } catch (InvocationTargetException | InstantiationException |
                 IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }

    public static Object constructTypeless(Class<?> clazz, Object[] args) {
        if (args == null) args = new Object[0];
        Class<?>[] params = new Class<?>[args.length];
        for (int i = 0; i < args.length; i++) params[i] = args[i].getClass();
        return constructTyped(clazz, args, params);
    }

    public static Method method(Class<?> clazz, Class<?>[] args, String... methods) {
        return cache(methodsCache, clazz, methods, () -> {
            for (String method : methods) {
                try {
                    return clazz.getMethod(method, args);
                } catch (NoSuchMethodException ignored) {
                }
            }
            throw new RuntimeException("Method not found from " + Arrays.toString(methods) + " for class " + clazz.getName() + " with args " + Arrays.toString(args));
        });
    }

    public static Object invokeMethodTyped(Class<?> clazz, Object instance, Object[] args, Class<?>[] search, String... methods) {
        if (args == null) args = new Object[0];
        if (search == null) search = new Class<?>[0];
        Method method = method(clazz, search, methods);
        try {
            return method.invoke(instance, args);
        } catch (InvocationTargetException | IllegalAccessException | NoSuchMethodError e) {
            throw new RuntimeException(e);
        }
    }

    public static Object invokeMethodTypeless(Class<?> clazz, Object instance, Object[] args, String... methods) {
        if (args == null) args = new Object[0];
        Class<?>[] search = new Class<?>[args.length];
        for (int i = 0; i < args.length; i++) search[i] = args[i].getClass();
        return invokeMethodTyped(clazz, instance, args, search, methods);
    }

    public static Field field(Class<?> clazz, String... fields) {
        return cache(fieldsCache, clazz, fields, () -> {
            for (String field : fields) {
                try {
                    return clazz.getField(field);
                } catch (NoSuchFieldException ignored) {
                }
            }
            throw new RuntimeException("Field not found from " + Arrays.toString(fields) + " for class " + clazz.getName());
        });
    }

    public static Object getField(Class<?> clazz, Object instance, String... fields) {
        Field f = field(clazz, fields);
        try {
            return f.get(instance);
        } catch (IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }

    public static void setField(Class<?> clazz, Object instance, Object value, String... fields) {
        Field f = field(clazz, fields);
        try {
            f.set(instance, value);
        } catch (IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }

    private static MinecraftVersion version = null;
    public static MinecraftVersion getVersion() {
        if (version != null) return version;
        Class<?> clazzGameVersion = clazz("com.mojang.bridge.game.GameVersion", "net.minecraft.class_6489", "net.minecraft.GameVersion");
        Class<?> clazzConstants = SharedConstants.class;
        Object gameVersion = invokeMethodTypeless(clazzConstants, null, null, "method_16673", "getGameVersion");
        try {
            version = new MinecraftVersion((String) invokeMethodTypeless(clazzGameVersion, gameVersion, null, "method_48019", "getName"));
        } catch (Exception ignored) {
            version = new MinecraftVersion((String) invokeMethodTypeless(clazzGameVersion, gameVersion, null, "comp_4025", "name"));
        }
        return version;
    }

    public static class MinecraftVersion {
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

        private final Map<String, Integer> cache = new HashMap<>();
        public int compare(String other) {
            return cache.computeIfAbsent(other, i -> {
                MinecraftVersion v = new MinecraftVersion(other);
                if (this.major != v.major) return Integer.compare(this.major, v.major);
                if (this.minor != v.minor) return Integer.compare(this.minor, v.minor);
                return Integer.compare(this.patch, v.patch);
            });
        }

        public boolean higher(String other) {
            return this.compare(other) > 0;
        }

        public boolean lower(String other) {
            return this.compare(other) < 0;
        }

        public boolean equals(String other) {
            return this.compare(other) == 0;
        }
    }

    public static Object noop(Objcet obj) {
        return obj;
    }
}
