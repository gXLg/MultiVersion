package dev.gxlg.multiversion;

import net.bytebuddy.ByteBuddy;
import net.bytebuddy.description.modifier.Visibility;
import net.bytebuddy.implementation.MethodDelegation;
import net.bytebuddy.implementation.bind.annotation.AllArguments;
import net.bytebuddy.implementation.bind.annotation.FieldValue;
import net.bytebuddy.implementation.bind.annotation.Origin;
import net.bytebuddy.implementation.bind.annotation.RuntimeType;
import net.bytebuddy.implementation.bind.annotation.SuperCall;
import net.bytebuddy.matcher.ElementMatchers;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.lang.invoke.VarHandle;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.Callable;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Stream;

@SuppressWarnings({ "unused" })
public class R {
    private static final Map<ClassLoader, Map<Integer, Class<?>>> clazzCache = Collections.synchronizedMap(new WeakHashMap<>());

    private static final Map<ClassLoader, Map<Integer, MethodHandle>> constructorsCache = Collections.synchronizedMap(new WeakHashMap<>());

    private static final Map<ClassLoader, Map<Integer, MethodHandle>> methodsCache = Collections.synchronizedMap(new WeakHashMap<>());

    private static final Map<ClassLoader, Map<Integer, VarHandle>> fieldsCache = Collections.synchronizedMap(new WeakHashMap<>());

    private static final MethodHandles.Lookup LOOKUP = MethodHandles.lookup();

    private static final MethodType METHOD_TYPE = MethodType.methodType(Object.class, Object.class, Object[].class);

    private static final MethodType CONSTRUCTOR_TYPE = MethodType.methodType(Object.class, Object[].class);

    private static <T> T cache(Map<ClassLoader, Map<Integer, T>> cache, Class<?> base, Class<?>[] types, String[] names, Supplier<T> supplier) {
        Map<Integer, T> cacheMap = cache.computeIfAbsent(Thread.currentThread().getContextClassLoader(), cl -> new HashMap<>());
        return cacheMap.computeIfAbsent(Objects.hash(base, Arrays.hashCode(types), Arrays.hashCode(names)), i -> supplier.get());
    }

    private static Class<?>[] types(Object[] types) {
        Class<?>[] array = new Class[types.length];
        for (int i = 0; i < types.length; i++) {
            array[i] = type(types[i]);
        }
        return array;
    }

    private static Class<?> type(Object type) {
        Class<?> c;
        if (type instanceof Class<?> clz) {
            c = clz;
        } else if (type instanceof RClass rclz) {
            c = rclz.self();
        } else if (type instanceof String str) {
            c = clz(str).self();
        } else {
            throw new RuntimeException("Is not a valid Type: " + type.getClass());
        }
        return c;
    }

    public static RClass clz(String names) {
        return new RClass(names);
    }

    public static RClass clz(Class<?> clz) {
        return new RClass(clz);
    }

    @SuppressWarnings("unchecked")
    public static <T> Function<Object, T[]> arrayWrapper(Function<Object, T> wrapperT) {
        return obj -> (T[]) Stream.of((Object[]) obj).map(wrapperT).toArray();
    }

    public static <T> Function<T[], Object> arrayUnwrapper(Function<T, Object> unwrapperT) {
        return wrap -> Stream.of(wrap).map(unwrapperT).toArray();
    }

    public static boolean methodMatches(Method method, Class<?>... types) {
        Class<?> returnType = types[0];
        Class<?>[] methodParams = method.getParameterTypes();
        if (types.length - 1 != methodParams.length) {
            return false;
        }
        if (!returnType.isAssignableFrom(method.getReturnType())) {
            return false;
        }
        for (int i = 0; i < types.length; i++) {
            if (!methodParams[i].isAssignableFrom(types[i + 1])) {
                return false;
            }
        }
        return true;
    }

    public static boolean fieldMatches(Field field, Class<?> fieldType) {
        return fieldType.isAssignableFrom(field.getType());
    }

    @SuppressWarnings("resource")
    public static <T extends RWrapper<?>> RClass extendWrapper(Class<T> superClass, Class<? extends T> extendingWrapper) {
        try {
            Class<?> superClz = ((RClass) clz(superClass).fld("clazz", RClass.class).get()).self();
            Class<?> intercept = superClass.getDeclaredClasses()[0];
            return R.clz(new ByteBuddy().subclass(superClz).name(extendingWrapper.getName() + "Impl").defineField("__wrapper", extendingWrapper, Visibility.PUBLIC)
                                        .method(ElementMatchers.isVirtual().and(ElementMatchers.not(ElementMatchers.isFinalizer()))).intercept(MethodDelegation.to(intercept)).make()
                                        .load(superClz.getClassLoader()).getLoaded());
        } catch (Exception e) {
            throw new RuntimeException("Failed to extend class", e);
        }
    }

    public static MethodHandle lookupMethod() {

        return null;
    }

    public static VarHandle lookupField() {
        return null;
    }

    public interface RWrapperInterface<T extends RWrapper<T>> {
        T wrapper();
    }

    public static class RClass {
        private final Supplier<Class<?>> lazyClz;

        private Class<?> clz = null;

        private RClass(String names) {
            lazyClz = () -> {
                String[] classNames = names.split("/");
                return cache(
                    clazzCache, null, new Class[0], classNames, () -> {
                        for (String clazz : classNames) {
                            try {
                                return Class.forName(clazz);
                            } catch (ClassNotFoundException ignored) {
                            }
                        }
                        throw new RuntimeException("Class not found from " + Arrays.toString(classNames));
                    }
                );
            };
        }

        private RClass(Class<?> clz) {
            lazyClz = () -> clz;
        }

        public RInstance inst(Object inst) {
            try {
                return new RInstance(self(), self().cast(inst));
            } catch (ClassCastException e) {
                throw new RuntimeException("Object is not of type " + self().getName() + ", instead: " + inst.getClass().getName());
            }
        }

        public RConstructor constr(Class<?>... types) {
            return new RConstructor(self(), types);
        }

        public RField fld(String names, Class<?> type) {
            return new RField(null, names, self(), type);
        }

        public RMethod mthd(String names, Class<?>... types) {
            return new RMethod(null, names, self(), types);
        }

        public Class<?> self() {
            if (clz == null) {
                clz = lazyClz.get();
            }
            return clz;
        }

        public RClass arrayType() {
            return clz(self().arrayType());
        }
    }

    public static class RInstance {
        private final Class<?> clz;

        private final Object inst;

        private RInstance(Class<?> clz, Object inst) {
            this.clz = clz;
            this.inst = inst;
        }

        public RField fld(String names, Class<?> type) {
            return new RField(inst, names, clz, type);
        }

        public RMethod mthd(String names, Class<?>... types) {
            return new RMethod(inst, names, clz, types);
        }

        public Object self() {
            return inst;
        }
    }

    public static class RMethod {
        private final Object inst;

        private final Supplier<MethodHandle> lazyMethod;

        private MethodHandle method = null;

        public RMethod(Object inst, String names, Class<?> clz, Class<?>[] types) {
            this.inst = inst;
            String[] methodNames = names.split("/");
            this.lazyMethod = () -> cache(
                methodsCache, clz, types, methodNames, () -> {
                    Set<String> nameSet = Set.of(methodNames);
                    for (Method method : clz.getDeclaredMethods()) {
                        if (nameSet.contains(method.getName()) && methodMatches(method, types)) {
                            try {
                                method.setAccessible(true);
                                return LOOKUP.unreflect(method).asSpreader(Object[].class, method.getParameterCount()).asType(METHOD_TYPE);
                            } catch (IllegalAccessException ignored) {
                            }
                        }
                    }
                    throw new RuntimeException("Method not found from " + Arrays.toString(methodNames) + " for " + clz + " with params " + Arrays.toString(types));
                }
            );
        }

        public Object invk(Object... args) {
            try {
                return self().invokeExact(inst, args);
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
        }

        public MethodHandle self() {
            if (method == null) {
                method = lazyMethod.get();
            }
            return method;
        }
    }

    public static class RField {
        private final Object inst;

        private final Supplier<VarHandle> lazyField;

        private VarHandle fld = null;

        public RField(Object inst, String names, Class<?> clz, Class<?> fieldType) {
            this.inst = inst;
            String[] fieldNames = names.split("/");
            this.lazyField = () -> cache(
                fieldsCache, clz, new Class[]{ fieldType }, fieldNames, () -> {
                    Set<String> nameSet = Set.of(fieldNames);
                    for (Field field : clz.getFields()) {
                        if (nameSet.contains(field.getName()) && fieldMatches(field, fieldType)) {
                            try {
                                field.setAccessible(true);
                                return LOOKUP.unreflectVarHandle(field);
                            } catch (IllegalAccessException ignored) {
                            }
                        }
                    }
                    throw new RuntimeException("Field not found from " + Arrays.toString(fieldNames) + " for " + clz + " of type " + type(fieldType));
                }
            );
        }

        public void set(Object value) {
            if (inst == null) {
                self().set(value);
            } else {
                self().set(inst, value);
            }
        }

        public Object get() {
            if (inst == null) {
                return self().get();
            } else {
                return self().get(inst);
            }
        }

        public VarHandle self() {
            if (fld == null) {
                fld = lazyField.get();
            }
            return fld;
        }
    }

    public static class RConstructor {
        private final Class<?> clz;

        private final Supplier<MethodHandle> lazyConstr;

        private MethodHandle constr = null;

        private RConstructor(Class<?> clz, Class<?>... types) {
            this.clz = clz;
            this.lazyConstr = () -> cache(
                constructorsCache, clz, types, new String[0], () -> {
                    try {
                        Constructor<?> c = clz.getConstructor(types);
                        c.setAccessible(true);
                        return LOOKUP.unreflectConstructor(c).asSpreader(Object[].class, c.getParameterCount()).asType(CONSTRUCTOR_TYPE);
                    } catch (NoSuchMethodException | IllegalAccessException e) {
                        throw new RuntimeException("Constructor not found for " + clz + " with args " + Arrays.toString(types));
                    }
                }
            );
        }

        public RInstance newInst(Object... args) {
            try {
                return new RInstance(clz, self().invokeExact(args));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
        }

        public MethodHandle self() {
            if (constr == null) {
                constr = lazyConstr.get();
            }
            return constr;
        }
    }

    public static abstract class RWrapper<S extends RWrapper<S>> {
        protected final Object instance;

        protected RWrapper(Object instance) {
            if (instance == null) {
                throw new RuntimeException("Cannot wrap null instance");
            }
            this.instance = instance;
        }

        public Object unwrap() {
            return instance;
        }

        public <T> T unwrap(Class<T> clz) {
            return clz.cast(instance);
        }

        public <T extends S> boolean isInstanceOf(Class<T> wrapperType) {
            return ((RClass) clz(wrapperType).fld("clazz", RClass.class).get()).self().isAssignableFrom(instance.getClass());
        }

        public <T extends S> T downcast(Class<T> wrapperType) {
            try {
                return wrapperType.cast(((RClass) clz(wrapperType).fld("clazz", RClass.class).get()).inst(instance).fld("__wrapper", RWrapper.class).get());
            } catch (Exception ignored) {
                return wrapperType.cast(clz(wrapperType).mthd("inst", RWrapper.class, Object.class).invk(instance));
            }
        }

        public boolean equals(S wrapper) {
            if (wrapper == null) {
                return false;
            }
            return Objects.equals(instance, wrapper.instance);
        }

        public static class Interceptor {
            @RuntimeType
            public static Object intercept(
                @Origin Method method, @FieldValue(
                    "__wrapper"
                ) RWrapper<?> wrapper, @AllArguments Object[] args, @SuperCall Callable<?> superCall
            ) throws Exception {
                return superCall.call();
            }
        }
    }
}
