<?php

namespace App\Services;

use DOMDocument;
use DOMNode;

final class PlacementRichText
{
    public static function sanitize(string $value): string
    {
        if (! preg_match('/<\/?[a-z][^>]*>/i', $value)) {
            return $value; // Plain-text legacy questions remain unchanged.
        }
        $document = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            $document->loadHTML('<?xml encoding="UTF-8"><html><body>'.$value.'</body></html>', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
            $render = function (DOMNode $node) use (&$render): string {
                if ($node->nodeType === XML_TEXT_NODE) {
                    return htmlspecialchars($node->nodeValue, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                }
                $tag = strtolower($node->nodeName);
                if (in_array($tag, ['script', 'style', 'iframe', 'object', 'svg', 'math', 'template'], true)) {
                    return '';
                }
                $content = '';
                foreach ($node->childNodes as $child) {
                    $content .= $render($child);
                }
                $tag = ['b' => 'strong', 'i' => 'em', 'div' => 'p'][$tag] ?? $tag;
                return in_array($tag, ['strong', 'em', 'u', 'ruby', 'rt', 'br', 'p'], true)
                    ? ($tag === 'br' ? '<br>' : '<'.$tag.'>'.$content.'</'.$tag.'>') : $content;
            };
            return $render($document->getElementsByTagName('body')->item(0));
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }
}
