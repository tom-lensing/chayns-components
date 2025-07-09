import { useCallback, useEffect, useMemo, useState } from 'react';
import { DropdownCoordinates, DropdownDirection } from '../types/dropdown';

interface UseDropdownListenerOptions {
    onClose: () => void;
    onOutsideClick: (event: MouseEvent) => void;
}

export const useDropdownListener = ({ onClose, onOutsideClick }: UseDropdownListenerOptions) => {
    useEffect(() => {
        document.addEventListener('click', onOutsideClick);
        window.addEventListener('blur', () => onClose());

        return () => {
            document.removeEventListener('click', onOutsideClick);
            window.addEventListener('blur', () => onClose());
        };
    }, [onOutsideClick, onClose]);
};

interface UseDropdownAlignmentOptions {
    direction: DropdownDirection;
    shouldUseTopAlignment: boolean;
    bodyWidth?: number;
    anchorElement: Element;
}

export const useDropdownAlignment = ({
    direction,
    shouldUseTopAlignment,
    anchorElement,
    bodyWidth,
}: UseDropdownAlignmentOptions) => {
    const [translateX, setTranslateX] = useState<string>('0px');
    const [translateY, setTranslateY] = useState<string>('0px');

    useEffect(() => {
        if (
            [
                DropdownDirection.BOTTOM_LEFT,
                DropdownDirection.TOP_LEFT,
                DropdownDirection.LEFT,
            ].includes(direction) &&
            typeof bodyWidth === 'number'
        ) {
            const difference = anchorElement.clientWidth - bodyWidth;

            setTranslateX(`${difference}px`);
        } else {
            setTranslateX('0px');
        }
    }, [anchorElement.clientWidth, bodyWidth, direction]);

    useEffect(() => {
        const useTopAlignment =
            shouldUseTopAlignment ||
            [
                DropdownDirection.TOP,
                DropdownDirection.TOP_LEFT,
                DropdownDirection.TOP_RIGHT,
            ].includes(direction);

        if (useTopAlignment) {
            setTranslateY('-100%');
        } else {
            setTranslateY('0px');
        }
    }, [direction, shouldUseTopAlignment]);

    return useMemo(() => ({ x: translateX, y: translateY }), [translateX, translateY]);
};

interface UseDropdownPositionOptions {
    container?: Element;
    anchorElement: Element;
    direction: DropdownDirection;
    contentHeight?: number;
}

export const useDropdownPosition = ({
    direction,
    anchorElement,
    container,
    contentHeight = 0,
}: UseDropdownPositionOptions) => {
    const [coordinates, setCoordinates] = useState<DropdownCoordinates>({ x: 0, y: 0 });
    const [shouldUseTopAlignment, setShouldUseTopAlignment] = useState(false);

    const calculateCoordinates = useCallback(() => {
        if (container) {
            const {
                left: anchorLeft,
                top: anchorTop,
                height: anchorHeight,
            } = anchorElement.getBoundingClientRect();

            const { left, top, height } = container.getBoundingClientRect();

            const x = anchorLeft - left + container.scrollLeft;
            const y = anchorTop - top + container.scrollTop;

            let useTopAlignment = [
                DropdownDirection.TOP,
                DropdownDirection.TOP_LEFT,
                DropdownDirection.TOP_RIGHT,
            ].includes(direction);

            const hasBottomAlignment = [
                DropdownDirection.BOTTOM,
                DropdownDirection.BOTTOM_LEFT,
                DropdownDirection.BOTTOM_RIGHT,
            ].includes(direction);

            if (!hasBottomAlignment && y + anchorHeight + contentHeight > height) {
                useTopAlignment = true;

                setShouldUseTopAlignment(true);
            } else {
                setShouldUseTopAlignment(false);
            }

            setCoordinates({ x, y: useTopAlignment ? y : y + anchorHeight });
        }
    }, [anchorElement, container, contentHeight, direction]);

    useEffect(() => {
        calculateCoordinates();

        setTimeout(() => {
            calculateCoordinates(); // Recalculate after a short delay to ensure the layout is updated
        }, 500);

        window.addEventListener('resize', calculateCoordinates);

        return () => {
            window.removeEventListener('resize', calculateCoordinates);
        };
    }, [calculateCoordinates]);

    return useMemo(
        () => ({ shouldUseTopAlignment, coordinates }),
        [coordinates, shouldUseTopAlignment],
    );
};

interface UseDropdownOptions {
    container?: Element;
    anchorElement: Element;
    direction: DropdownDirection;
    bodyWidth?: number;
    contentHeight?: number;
}

export const useDropdown = ({
    anchorElement,
    container,
    contentHeight,
    bodyWidth,
    direction,
}: UseDropdownOptions) => {
    const { shouldUseTopAlignment, coordinates } = useDropdownPosition({
        contentHeight,
        container,
        anchorElement,
        direction,
    });
    const transform = useDropdownAlignment({
        shouldUseTopAlignment,
        bodyWidth,
        anchorElement,
        direction,
    });

    const width = useMemo(() => anchorElement.clientWidth, [anchorElement]);

    return useMemo(() => ({ coordinates, transform, width }), [coordinates, transform, width]);
};
