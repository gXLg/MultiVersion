package dev.gxlg.multiversion.adapters.java.util;

import java.util.Optional;
import java.util.function.Function;

public class Optional {
    public static <S> Function<Object, Optional<S>> wrapper(Function<Object, S> wrapperS) {
        return object -> Optional.of(wrapperS.apply(object));
    }

    public static <S> Function<Optional<S>, Object> unwrapper(Function<S, Object> unwrapperS) {
        return optional -> optional.map(unwrapperS).orElse(null);
    }
}
