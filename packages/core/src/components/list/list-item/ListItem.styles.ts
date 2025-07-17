import { motion } from 'motion/react';
import styled, { css } from 'styled-components';
import type { WithTheme } from '../../color-scheme-provider/ColorSchemeProvider';
import { CSSProperties } from 'react';

type StyledListItemProps = WithTheme<{
    $backgroundColor?: CSSProperties['backgroundColor'];
    $isClickable: boolean;
    $isInAccordion: boolean;
    $isOpen: boolean;
    $isWrapped: boolean;
    $shouldForceBackground?: boolean;
    $shouldForceBottomLine?: boolean;
    $shouldHideBottomLine: boolean;
    $shouldHideIndicator: boolean;
    $shouldShowSeparatorBelow: boolean;
}>;

export const StyledMotionListItem = styled(motion.div)<StyledListItemProps>`
    overflow: hidden;
    transition: background-color 0.3s ease;

    ${({ $isInAccordion, $shouldHideIndicator }: StyledListItemProps) =>
        $isInAccordion &&
        css`
            padding-left: ${$shouldHideIndicator ? '16px' : '8px'};
        `}

    ${({ $isInAccordion, $isOpen, $shouldForceBackground, theme }) =>
        ((!$isInAccordion && $isOpen) || $shouldForceBackground) &&
        css`
            background-color: rgba(${theme['100-rgb']}, ${theme.cardBackgroundOpacity});
        `}
    
    ${({ $backgroundColor, $isInAccordion, $isOpen, $shouldForceBackground }) =>
        $backgroundColor &&
        ((!$isInAccordion && $isOpen) || $shouldForceBackground) &&
        css`
            background-color: ${$backgroundColor} !important;
        `}

    ${({ $isClickable, $isInAccordion, theme }) =>
        $isClickable &&
        !$isInAccordion &&
        css`
            &&:hover {
                background-color: rgba(${theme['100-rgb']}, ${theme.cardBackgroundOpacity});
            }
        `}
    
    ${({
        $isInAccordion,
        $isOpen,
        $isWrapped,
        $shouldHideBottomLine,
        $shouldForceBottomLine,
        $shouldShowSeparatorBelow,
        theme,
    }: StyledListItemProps) => {
        if (
            $shouldShowSeparatorBelow ||
            ((!$isOpen || $isWrapped || $isInAccordion) &&
                theme.accordionLines &&
                !$shouldHideBottomLine)
        ) {
            if ($shouldForceBottomLine) {
                return css`
                    border-bottom: ${$shouldShowSeparatorBelow ? '4px' : '1px'} solid
                        rgba(${theme['headline-rgb']}, 0.5);
                `;
            }

            return css`
                &&:not(:last-child) {
                    border-bottom: ${$shouldShowSeparatorBelow ? '4px' : '1px'} solid
                        rgba(${theme['headline-rgb']}, 0.5);
                }
            `;
        }

        return undefined;
    }}

    ${({ $isWrapped }) =>
        $isWrapped &&
        css`
            padding-left: 26px;
        `}
`;

export const StyledListItemTooltip = styled.div`
    padding: 6px;
`;
