import { AreaContext, BrowserName, getIsTouch } from '@chayns-components/core';
import { getDevice } from 'chayns-api';
import { AnimatePresence } from 'motion/react';
import React, {
    ChangeEvent,
    ClipboardEvent,
    CSSProperties,
    FocusEvent,
    FocusEventHandler,
    forwardRef,
    KeyboardEvent as TmpKeyboardEvent,
    KeyboardEventHandler,
    ReactElement,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
} from 'react';
import type { PopupAlignment } from '../../constants/alignment';
import { convertEmojisToUnicode, escapeHTML } from '../../utils/emoji';
import { insertTextAtCursorPosition, replaceText } from '../../utils/insert';
import {
    getCharCodeThatWillBeDeleted,
    insertInvisibleCursorMarker,
    restoreSelection,
    saveSelection,
} from '../../utils/selection';
import { convertHTMLToText, convertTextToHTML } from '../../utils/text';
import EmojiPickerPopup from '../emoji-picker-popup/EmojiPickerPopup';
import {
    StyledEmojiInput,
    StyledEmojiInputContent,
    StyledEmojiInputLabel,
    StyledEmojiInputRightWrapper,
    StyledMotionEmojiInputEditor,
    StyledMotionEmojiInputProgress,
} from './EmojiInput.styles';
import PrefixElement from './prefix-element/PrefixElement';
import { loadEmojiShortNames } from '../../utils/asyncEmojiData';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type EmojiInputProps = {
    /**
     * Access token of the logged-in user. Is needed to load and save the history of the emojis.
     */
    accessToken?: string;
    /**
     * Sets the height of the input field to a fixed value. If this value is not set, the component will use the needed height until the maximum height is reached.
     */
    height?: CSSProperties['height'];
    /**
     * HTML id of the input element
     */
    inputId?: string;
    /**
     * Disables the input so that it cannot be changed anymore
     */
    isDisabled?: boolean;
    /**
     * Sets the maximum height of the input field.
     */
    maxHeight?: CSSProperties['maxHeight'];
    /**
     * Function that is executed when the input field loses focus.
     */
    onBlur?: FocusEventHandler<HTMLDivElement>;
    /**
     * Function that is executed when the input field gets the focus.
     */
    onFocus?: FocusEventHandler<HTMLDivElement>;
    /**
     * Function that is executed when the text of the input changes. In addition to the original
     * event, the original text is returned as second parameter, in which the internally used HTML
     * elements have been converted back to BB codes.
     */
    onInput?: (event: ChangeEvent<HTMLDivElement>, originalText: string) => void;
    /**
     * Function that is executed when a key is pressed down.
     */
    onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
    /**
     * Function to be executed if the prefixElement is removed.
     */
    onPrefixElementRemove?: () => void;
    /**
     * Function that is executed when the visibility of the popup changes.
     * @param {boolean} isVisible - Whether the popup is visible or not
     */
    onPopupVisibilityChange?: (isVisible: boolean) => void;
    /**
     * Person id of the logged-in user. Is needed to load and save the history of the emojis.
     */
    personId?: string;
    /**
     * Placeholder for the input field
     */
    placeholder?: string | ReactElement;
    /**
     * Sets the alignment of the popup to a fixed value. If this value is not set, the component
     * calculates the best position on its own. Use the imported 'PopupAlignment' enum to set this
     * value.
     */
    popupAlignment?: PopupAlignment;
    /**
     * Element that is rendered before the input field but the placeholder is still visible.
     */
    prefixElement?: string;
    /**
     * Element that is rendered inside the EmojiInput on the right side.
     */
    rightElement?: ReactNode;
    /**
     * Whether the placeholder should be shown after the input has focus.
     */
    shouldHidePlaceholderOnFocus?: boolean;
    /**
     * Prevents the EmojiPickerPopup icon from being displayed
     */
    shouldPreventEmojiPicker?: boolean;
    /**
     * The plain text value of the input field. Instead of HTML elements BB codes must be used at
     * this point. These are then converted by the input field into corresponding HTML elements.
     */
    value: string;
};

export type EmojiInputRef = {
    insertTextAtCursorPosition: (text: string) => void;
    replaceText: (searchText: string, replaceText: string) => void;
    startProgress: (durationInSeconds: number) => void;
    stopProgress: () => void;
    focus: () => void;
    blur: () => void;
};

const EmojiInput = forwardRef<EmojiInputRef, EmojiInputProps>(
    (
        {
            accessToken,
            height,
            inputId,
            isDisabled,
            maxHeight = '190px',
            onBlur,
            onFocus,
            onInput,
            onKeyDown,
            onPrefixElementRemove,
            onPopupVisibilityChange,
            personId,
            placeholder,
            popupAlignment,
            prefixElement,
            rightElement,
            shouldHidePlaceholderOnFocus = false,
            shouldPreventEmojiPicker,
            value,
        },
        ref,
    ) => {
        const [isTouch] = useState(getIsTouch());
        const [plainTextValue, setPlainTextValue] = useState(value);
        const [hasFocus, setHasFocus] = useState(false);
        const [progressDuration, setProgressDuration] = useState(0);
        const [labelWidth, setLabelWidth] = useState(0);
        const [isPopupVisible, setIsPopupVisible] = useState(false);
        const [isPrefixAnimationFinished, setIsPrefixAnimationFinished] = useState(!prefixElement);
        const [prefixElementWidth, setPrefixElementWidth] = useState<number | undefined>();
        const [emojiShortNames, setEmojiShortNames] = useState(null);

        const areaProvider = useContext(AreaContext);

        const editorRef = useRef<HTMLDivElement>(null);
        const prefixElementRef = useRef<HTMLDivElement>(null);
        const hasPrefixRendered = useRef(false);
        const hasPrefixChanged = useRef(false);
        const shouldDeleteOneMoreBackwards = useRef(false);
        const shouldDeleteOneMoreForwards = useRef(false);

        const valueRef = useRef(value);

        const { browser } = getDevice();

        const shouldChangeColor = useMemo(
            () => areaProvider.shouldChangeColor ?? false,
            [areaProvider.shouldChangeColor],
        );

        useEffect(() => {
            loadEmojiShortNames((data) => {
                console.log('nice', data);
            });
        }, []);

        /**
         * This function updates the content of the 'contentEditable' element if the new text is
         * different from the previous content. So this is only true if, for example, a text like ":-)"
         * has been replaced to the corresponding emoji.
         *
         * When updating the HTML, the current cursor position is saved before replacing the content, so
         * that it can be set again afterward.
         */
        const handleUpdateHTML = useCallback((html: string) => {
            if (!editorRef.current) {
                return;
            }

            let newInnerHTML = convertEmojisToUnicode(html);

            newInnerHTML = convertTextToHTML(newInnerHTML);

            if (newInnerHTML !== editorRef.current.innerHTML) {
                saveSelection(editorRef.current, { shouldIgnoreEmptyTextNodes: true });

                editorRef.current.innerHTML = newInnerHTML;

                restoreSelection(editorRef.current);
            }
        }, []);

        const handleBeforeInput = useCallback(
            (event: FormEvent<HTMLDivElement>) => {
                if (!editorRef.current) {
                    return;
                }

                if (isDisabled) {
                    event.preventDefault();
                    event.stopPropagation();

                    return;
                }

                const { data, type } = event.nativeEvent as InputEvent;

                if (type === 'textInput' && data && data.includes('\n')) {
                    event.preventDefault();
                    event.stopPropagation();

                    const text = convertEmojisToUnicode(data);

                    insertTextAtCursorPosition({ editorElement: editorRef.current, text });

                    const newEvent = new Event('input', { bubbles: true });

                    editorRef.current.dispatchEvent(newEvent);
                }
            },
            [isDisabled],
        );

        /**
         * This function handles the 'input' events of the 'contentEditable' element and also passes the
         * respective event up accordingly if the 'onInput' property is a function.
         */
        const handleInput = useCallback(
            (event: ChangeEvent<HTMLDivElement>) => {
                if (!editorRef.current) {
                    return;
                }

                if (isDisabled) {
                    event.stopPropagation();
                    event.preventDefault();
                }

                if (shouldDeleteOneMoreBackwards.current) {
                    shouldDeleteOneMoreBackwards.current = false;
                    shouldDeleteOneMoreForwards.current = false;

                    event.preventDefault();
                    event.stopPropagation();

                    // Remove content and set cursor to the right position
                    insertInvisibleCursorMarker();

                    return;
                }

                if (shouldDeleteOneMoreForwards.current) {
                    shouldDeleteOneMoreBackwards.current = false;
                    shouldDeleteOneMoreForwards.current = false;

                    event.preventDefault();
                    event.stopPropagation();

                    // noinspection JSDeprecatedSymbols
                    document.execCommand('forwardDelete', false);

                    return;
                }

                handleUpdateHTML(editorRef.current.innerHTML);

                const text = convertHTMLToText(editorRef.current.innerHTML);

                setPlainTextValue(text);

                if (typeof onInput === 'function') {
                    onInput(event, text);
                }
            },
            [handleUpdateHTML, isDisabled, onInput],
        );

        const handleKeyDown = useCallback(
            (event: TmpKeyboardEvent<HTMLDivElement>) => {
                if (isDisabled) {
                    event.preventDefault();
                    event.stopPropagation();

                    return;
                }

                if (event.key === 'Enter' && isPopupVisible) {
                    event.preventDefault();

                    return;
                }

                if (typeof onKeyDown === 'function') {
                    onKeyDown(event);
                }

                if (event.key === 'Enter' && !event.isPropagationStopped() && editorRef.current) {
                    event.preventDefault();

                    // noinspection JSDeprecatedSymbols
                    document.execCommand('insertLineBreak', false);
                }

                if (
                    event.key === 'Backspace' ||
                    event.key === 'Delete' ||
                    event.key === 'Unidentified'
                ) {
                    const charCodeThatWillBeDeleted = getCharCodeThatWillBeDeleted(event);

                    if (charCodeThatWillBeDeleted === 8203) {
                        if (event.key === 'Backspace' || event.key === 'Unidentified') {
                            shouldDeleteOneMoreBackwards.current = true;
                        } else {
                            shouldDeleteOneMoreForwards.current = true;
                        }
                    }
                }
            },
            [isDisabled, isPopupVisible, onKeyDown],
        );

        const handlePopupVisibility = useCallback(
            (isVisible: boolean) => {
                setIsPopupVisible(isVisible);

                if (editorRef.current && isVisible) {
                    saveSelection(editorRef.current);
                }

                if (typeof onPopupVisibilityChange === 'function') {
                    onPopupVisibilityChange(isVisible);
                }
            },
            [onPopupVisibilityChange],
        );

        /**
         * This function prevents formatting from being adopted when texts are inserted. To do this, the
         * plain text is read from the event after the default behavior has been prevented. The plain
         * text is then inserted at the correct position in the input field using document.execCommand('insertHTML')
         */
        const handlePaste = useCallback(
            (event: ClipboardEvent<HTMLDivElement>) => {
                if (editorRef.current) {
                    event.preventDefault();

                    if (isDisabled) {
                        event.stopPropagation();

                        return;
                    }

                    // This ensures, that only the copied text is inserted and not its HTML formatting.
                    let text = event.clipboardData.getData('text/plain');

                    text = convertEmojisToUnicode(text);

                    /* This ensures, that valid HTML in the inserted text is not interpreted as such. e.g. if the user
                       pasted the text '<b>test</b>' (not as formatted html), the <b> tags need to be escaped, to
                       prevent it from being interpreted as html. */
                    text = escapeHTML(text);

                    // Insert an invisible control character at the end of the text to place the cursor in the correct position after insertion.
                    if (text.includes('\n')) {
                        text += '\u200C';
                    }

                    // This deprecated function is used, because it causes the inserted content to be added to the undo stack.
                    // If the text were to be inserted directly into the 'innerHTML' of the editor element, the undo stack would not be updated.
                    // In that case on CTRL+Z the inserted text would not be removed.
                    document.execCommand('insertHTML', false, text);

                    const newEvent = new Event('input', { bubbles: true });

                    editorRef.current.dispatchEvent(newEvent);
                }
            },
            [isDisabled],
        );

        /**
         * This function prevents formatting from being adopted when texts are dropped. To do this, the
         * plain text is read from the event after the default behavior has been prevented. The plain
         * text is then inserted at the correct position in the input field using document.execCommand('insertHTML')
         */
        const handleDrop = useCallback(
            (event: React.DragEvent<HTMLDivElement>) => {
                if (editorRef.current) {
                    event.preventDefault();

                    if (isDisabled) {
                        event.stopPropagation();

                        return;
                    }

                    // This ensures, that only the dropped text is inserted and not its HTML formatting.
                    let text = event.dataTransfer?.getData('text');

                    if (!text) {
                        return;
                    }

                    text = convertEmojisToUnicode(text);

                    /* This ensures, that valid HTML in the inserted text is not interpreted as such. e.g. if the user
                       drops the text '<b>test</b>' (not as formatted html), the <b> tags need to be escaped, to
                       prevent it from being interpreted as html. */
                    text = escapeHTML(text);

                    // This deprecated function is used, because it causes the inserted content to be added to the undo stack.
                    // If the text were to be inserted directly into the 'innerHTML' of the editor element, the undo stack would not be updated.
                    // In that case on CTRL+Z the inserted text would not be removed.
                    document.execCommand('insertHTML', false, text);

                    const newEvent = new Event('input', { bubbles: true });

                    editorRef.current.dispatchEvent(newEvent);
                }
            },
            [isDisabled],
        );

        /**
         * This function uses the 'insertTextAtCursorPosition' function to insert the emoji at the
         * correct position in the editor element.
         *
         * At the end an 'input' event is dispatched, so that the function 'handleInput' is triggered,
         * which in turn executes the 'onInput' function from the props. So this serves to ensure that
         * the event is also passed through to the top when inserting via the popup.
         */
        const handlePopupSelect = useCallback((emoji: string) => {
            if (editorRef.current) {
                insertTextAtCursorPosition({
                    editorElement: editorRef.current,
                    text: emoji,
                    shouldUseSavedSelection: true,
                });

                const event = new Event('input', { bubbles: true });

                editorRef.current.dispatchEvent(event);
            }
        }, []);

        useEffect(() => {
            if (typeof onPrefixElementRemove !== 'function') {
                return;
            }

            if (!hasPrefixRendered.current) {
                return;
            }

            const convertedText = convertHTMLToText(editorRef.current?.innerHTML ?? '').replace(
                '&nbsp;',
                ' ',
            );
            const convertedPrefix = prefixElement && prefixElement.replace('&nbsp;', ' ');

            if (
                (convertedPrefix &&
                    convertedText.includes(convertedPrefix) &&
                    convertedText.length > convertedPrefix.length) ||
                convertedPrefix === convertedText
            ) {
                return;
            }

            if (hasPrefixChanged.current) {
                hasPrefixChanged.current = false;

                return;
            }

            onPrefixElementRemove();
            hasPrefixRendered.current = false;
        }, [onPrefixElementRemove, plainTextValue.length, prefixElement]);

        useEffect(() => {
            if (typeof prefixElement === 'string') {
                hasPrefixChanged.current = true;
            }
        }, [prefixElement]);

        useEffect(() => {
            if (value !== plainTextValue) {
                setPlainTextValue(value);

                handleUpdateHTML(value);
            }
        }, [handleUpdateHTML, plainTextValue, value]);

        // This effect is used to call the 'handleUpdateHTML' function once after the component has been
        // rendered. This is necessary because the 'contentEditable' element otherwise does not display
        // the HTML content correctly when the component is rendered for the first time.
        useIsomorphicLayoutEffect(() => {
            handleUpdateHTML(valueRef.current);
        }, [handleUpdateHTML]);

        const handleInsertTextAtCursorPosition = useCallback((text: string) => {
            if (editorRef.current) {
                insertTextAtCursorPosition({ editorElement: editorRef.current, text });

                const newEvent = new Event('input', { bubbles: true });

                editorRef.current.dispatchEvent(newEvent);
            }
        }, []);

        const handleReplaceText = useCallback((searchText: string, pasteText: string) => {
            if (editorRef.current) {
                replaceText({ editorElement: editorRef.current, searchText, pasteText });

                const newEvent = new Event('input', { bubbles: true });

                editorRef.current.dispatchEvent(newEvent);
            }
        }, []);

        const handleStartProgress = useCallback((duration: number) => {
            setProgressDuration(duration);
        }, []);

        const handleStopProgress = useCallback(() => {
            setProgressDuration(0);
        }, []);

        useImperativeHandle(
            ref,
            () => ({
                insertTextAtCursorPosition: handleInsertTextAtCursorPosition,
                replaceText: handleReplaceText,
                startProgress: handleStartProgress,
                stopProgress: handleStopProgress,
                focus: () => editorRef.current?.focus(),
                blur: () => editorRef.current?.blur(),
            }),
            [
                handleInsertTextAtCursorPosition,
                handleReplaceText,
                handleStartProgress,
                handleStopProgress,
            ],
        );

        useEffect(() => {
            /**
             * This function ensures that the input field does not lose focus when the popup is opened
             * or an emoji is selected in it. For this purpose the corresponding elements get the class
             * 'prevent-lose-focus'.
             *
             * The class can also be set to any other elements that should also not cause the input
             * field to lose focus.
             */
            const handlePreventLoseFocus = (event: MouseEvent) => {
                const element = event.target as Element;

                if (
                    element.classList.contains('prevent-lose-focus') ||
                    element.parentElement?.classList.contains('prevent-lose-focus') ||
                    element.parentElement?.parentElement?.classList.contains('prevent-lose-focus')
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            };

            document.body.addEventListener('mousedown', handlePreventLoseFocus);

            return () => {
                document.body.removeEventListener('mousedown', handlePreventLoseFocus);
            };
        }, []);

        const shouldShowPlaceholder = useMemo(() => {
            if (!isPrefixAnimationFinished) {
                return false;
            }

            const isJustPrefixElement =
                prefixElement && convertTextToHTML(prefixElement) === editorRef.current?.innerHTML;

            const shouldRenderPlaceholder =
                (prefixElement && !plainTextValue) ||
                (prefixElement ? prefixElementWidth && prefixElementWidth > 0 : true);

            switch (true) {
                case (!plainTextValue || isJustPrefixElement) &&
                    shouldHidePlaceholderOnFocus &&
                    !hasFocus:
                case (!plainTextValue || isJustPrefixElement) && !shouldHidePlaceholderOnFocus:
                    return shouldRenderPlaceholder;
                case (!plainTextValue || isJustPrefixElement) &&
                    shouldHidePlaceholderOnFocus &&
                    hasFocus:
                    return false;
                default:
                    return false;
            }
        }, [
            isPrefixAnimationFinished,
            hasFocus,
            plainTextValue,
            prefixElement,
            shouldHidePlaceholderOnFocus,
            prefixElementWidth,
        ]);

        useEffect(() => {
            if (prefixElement) {
                setIsPrefixAnimationFinished(false);
            }
        }, [prefixElement]);

        const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
            if (typeof onFocus === 'function' && !isDisabled) {
                onFocus(event);
            }

            setHasFocus(true);
        };

        const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
            if (typeof onBlur === 'function' && !isDisabled) {
                onBlur(event);
            }

            setHasFocus(false);
        };

        useEffect(() => {
            if (editorRef.current && prefixElement) {
                const text = convertEmojisToUnicode(prefixElement);

                insertTextAtCursorPosition({ editorElement: editorRef.current, text });

                handleUpdateHTML(prefixElement);
                hasPrefixRendered.current = true;
            }
        }, [handleUpdateHTML, prefixElement]);

        useEffect(() => {
            if (
                prefixElementRef.current &&
                prefixElement &&
                convertTextToHTML(prefixElement) === editorRef.current?.innerHTML
            ) {
                setPrefixElementWidth(prefixElementRef.current.offsetWidth + 2);
            } else {
                setPrefixElementWidth(undefined);
            }
        }, [plainTextValue, prefixElement]);

        useEffect(() => {
            const handleResize = () => {
                if (editorRef.current) {
                    setLabelWidth(editorRef.current.offsetWidth);
                }
            };

            const resizeObserver = new ResizeObserver(handleResize);

            if (editorRef.current) {
                resizeObserver.observe(editorRef.current);
            }

            return () => {
                resizeObserver.disconnect();
            };
        }, []);

        useEffect(() => {
            const blurElement = () => {
                if (
                    editorRef.current &&
                    document.activeElement === editorRef.current &&
                    isDisabled
                ) {
                    editorRef.current.blur();
                }
            };

            document.addEventListener('focus', blurElement, true);

            return () => {
                document.removeEventListener('focus', blurElement, true);
            };
        }, [isDisabled]);

        return (
            <StyledEmojiInput $isDisabled={isDisabled} $shouldChangeColor={shouldChangeColor}>
                <AnimatePresence initial>
                    {progressDuration > 0 && (
                        <StyledMotionEmojiInputProgress
                            animate={{ width: '100%' }}
                            exit={{ opacity: 0 }}
                            initial={{ opacity: 1, width: '0%' }}
                            transition={{
                                width: {
                                    ease: 'linear',
                                    duration: progressDuration,
                                },
                                opacity: {
                                    type: 'tween',
                                    duration: 0.3,
                                },
                            }}
                        />
                    )}
                </AnimatePresence>
                <StyledEmojiInputContent>
                    {prefixElement && (
                        <PrefixElement
                            key={prefixElement}
                            element={prefixElement}
                            prefixElementRef={prefixElementRef}
                            setIsPrefixAnimationFinished={setIsPrefixAnimationFinished}
                        />
                    )}
                    <StyledMotionEmojiInputEditor
                        $browser={browser?.name as BrowserName}
                        animate={{ maxHeight: height ?? maxHeight, minHeight: height ?? '26px' }}
                        contentEditable
                        id={inputId}
                        onBeforeInput={handleBeforeInput}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        onDrop={handleDrop}
                        ref={editorRef}
                        $shouldShowContent={isPrefixAnimationFinished}
                        transition={{ type: 'tween', duration: 0.2 }}
                    />

                    {shouldShowPlaceholder && (
                        <StyledEmojiInputLabel
                            $maxWidth={labelWidth}
                            $offsetWidth={prefixElementWidth}
                        >
                            {placeholder}
                        </StyledEmojiInputLabel>
                    )}
                    {!isTouch && !shouldPreventEmojiPicker && (
                        <EmojiPickerPopup
                            accessToken={accessToken}
                            onSelect={handlePopupSelect}
                            onPopupVisibilityChange={handlePopupVisibility}
                            personId={personId}
                        />
                    )}
                </StyledEmojiInputContent>
                {rightElement && (
                    <StyledEmojiInputRightWrapper>{rightElement}</StyledEmojiInputRightWrapper>
                )}
            </StyledEmojiInput>
        );
    },
);

EmojiInput.displayName = 'EmojiInput';

export default EmojiInput;
