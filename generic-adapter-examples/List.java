package dev.gxlg.multiversion.adapters.java.util;

import java.util.List;
import java.util.function.Function;

public class List {
    public static <S> Function<Object, List<S>> wrapper(Function<Object, S> wrapperS) {
        return object -> ((List<?>) object).stream().map(wrapperS).toList();
    }

    public static <S> Function<List<S>, Object> unwrapper(Function<S, Object> unwrapperS) {
        return list -> list.stream().map(unwrapperS).toList();
    }
}
