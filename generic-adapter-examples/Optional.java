package dev.gxlg.multiversion.adapters.java.util;

import java.util.Optional;
import java.util.function.Function;

public class Optional {
    public static <T> Function<?, Optional<T>> wrapper(Function<Object, T> wrapperT) {
        return obj -> Optional.of(wrapperT.apply(obj));
    }

    public static <T> Function<Optional<T>, ?> unwrapper(Function<T, Object> unwrapperT) {
        return opt -> opt.map(unwrapperT).orElse(null);
    }
}
