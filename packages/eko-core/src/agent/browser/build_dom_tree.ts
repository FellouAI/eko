// @ts-nocheck
export function run_build_dom_tree() {
  var computedStyleCache = new WeakMap();

  /**
   * Gets the cached computed style for an element.
   */
  function getCachedComputedStyle(element) {
    if (!element) return null;
    if (computedStyleCache.has(element)) {
      return computedStyleCache.get(element);
    }
    try {
      const style = window.getComputedStyle(element);
      if (style) {
        computedStyleCache.set(element, style);
      }
      return style;
    } catch (e) {
      return null;
    }
  }

  /**
   * Get clickable elements on the page
   *
   * @param {*} markHighlightElements Is mark highlighted
   * @param {*} includeAttributes [attr_names...]
   * @returns { element_str, client_rect, selector_map, area_map }
   */
  function get_clickable_elements(markHighlightElements = true, includeAttributes) {
    window.clickable_elements = {};
    computedStyleCache = new WeakMap();
    document.querySelectorAll("[eko-user-highlight-id]").forEach(ele => ele.removeAttribute("eko-user-highlight-id"));
    let page_tree = build_dom_tree(markHighlightElements);
    let element_tree = parse_node(page_tree);
    let element_str = clickable_elements_to_string(element_tree, includeAttributes);
    let client_rect = {
      width: window.innerWidth || document.documentElement.clientWidth,
      height: window.innerHeight || document.documentElement.clientHeight,
    }
    if (markHighlightElements) {
      let selector_map = {};
      // selector_map = create_selector_map(element_tree);
      return { element_str, client_rect, selector_map };
    } else {
      let area_map = create_area_map(element_tree);
      return { element_str, client_rect, area_map };
    }
  }

  function get_highlight_element(highlightIndex) {
    let element = document.querySelector(`[eko-user-highlight-id="eko-highlight-${highlightIndex}"]`);
    return element || window.clickable_elements[highlightIndex];
  }

  function remove_highlight() {
    let highlight = document.getElementById('eko-highlight-container');
    if (highlight) {
      highlight.remove();
    }
    computedStyleCache = new WeakMap();
  }

  function clickable_elements_to_string(element_tree, includeAttributes) {
    if (!includeAttributes) {
      includeAttributes = [
        'id',
        'title',
        'type',
        'name',
        'role',
        'class',
        'src',
        'href',
        'aria-label',
        'placeholder',
        'value',
        'alt',
        'aria-expanded',
      ];
    }

    function get_all_text_till_next_clickable_element(element_node) {
      let text_parts = [];
      function collect_text(node) {
        if (node.tagName && node != element_node && node.highlightIndex != null) {
          return;
        }
        if (!node.tagName && node.text) {
          text_parts.push(node.text);
        } else if (node.tagName) {
          for (let i = 0; i < node.children.length; i++) {
            collect_text(node.children[i]);
          }
        }
      }
      collect_text(element_node);
      return text_parts.join('\n').trim().replace(/\n+/g, ' ');
    }

    function has_parent_with_highlight_index(node) {
      let current = node.parent;
      while (current) {
        if (current.highlightIndex != null) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    let formatted_text = [];
    function process_node(node, depth) {
      if (node.text == null) {
        if (node.highlightIndex != null) {
          let attributes_str = '';
          if (includeAttributes) {
            for (let i = 0; i < includeAttributes.length; i++) {
              let key = includeAttributes[i];
              let value = node.attributes[key];
              if (key == "class" && value && value.length > 30) {
                let classList = value.split(" ").slice(0, 3);
                value = classList.join(" ");
              } else if ((key == "src" || key == "href") && value && value.length > 200) {
                continue;
              } else if ((key == "src" || key == "href") && value && value.startsWith("/")) {
                value = window.location.origin + value;
              }
              if (key && value) {
                attributes_str += ` ${key}="${value}"`;
              }
            }
            attributes_str = attributes_str.replace(/\n+/g, ' ');
          }
          let text = get_all_text_till_next_clickable_element(node);
          formatted_text.push(
            `[${node.highlightIndex}]:<${node.tagName}${attributes_str}>${text}</${node.tagName}>`
          );
        }
        for (let i = 0; i < node.children.length; i++) {
          let child = node.children[i];
          process_node(child, depth + 1);
        }
      } else if (!has_parent_with_highlight_index(node)) {
        formatted_text.push(`[]:${node.text}`);
      }
    }
    process_node(element_tree, 0);
    return formatted_text.join('\n');
  }

  function create_selector_map(element_tree) {
    let selector_map = {};
    function process_node(node) {
      if (node.tagName) {
        if (node.highlightIndex != null) {
          selector_map[node.highlightIndex] = node;
        }
        for (let i = 0; i < node.children.length; i++) {
          process_node(node.children[i]);
        }
      }
    }
    process_node(element_tree);
    return selector_map;
  }

  function create_area_map(element_tree) {
    let area_map = {};
    function process_node(node) {
      if (node.tagName) {
        if (node.highlightIndex != null) {
          const element = window.clickable_elements[node.highlightIndex]
          area_map[node.highlightIndex] = get_element_real_bounding_rect(element);
        }
        for (let i = 0; i < node.children.length; i++) {
          process_node(node.children[i]);
        }
      }
    }
    process_node(element_tree);
    return area_map;
  }

  function get_element_real_bounding_rect(element) {
    if (!element || !(element instanceof Element)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let rect = element.getBoundingClientRect();
    let x = rect.left;
    let y = rect.top;
    let width = rect.width;
    let height = rect.height;

    let win = element.ownerDocument.defaultView;
    let maxDepth = 10;
    let depth = 0;

    while (win && win !== win.parent && depth < maxDepth) {
      depth++;
      const frameElement = win.frameElement;
      if (!frameElement) {
        break;
      }

      const frameRect = frameElement.getBoundingClientRect();
      x += frameRect.left;
      y += frameRect.top;

      // Consider the border and padding of the iframe.
      const frameStyle = getCachedComputedStyle(frameElement);
      x += parseFloat(frameStyle.borderLeftWidth) || 0;
      y += parseFloat(frameStyle.borderTopWidth) || 0;
      x += parseFloat(frameStyle.paddingLeft) || 0;
      y += parseFloat(frameStyle.paddingTop) || 0;
      win = win.parent;
    }
    return { x, y, width, height };
  }

  function parse_node(node_data, parent) {
    if (!node_data) {
      return;
    }
    if (node_data.type == 'TEXT_NODE') {
      return {
        text: node_data.text || '',
        isVisible: node_data.isVisible || false,
        parent: parent,
      };
    }
    let element_node = {
      tagName: node_data.tagName,
      xpath: node_data.xpath,
      highlightIndex: node_data.highlightIndex,
      attributes: node_data.attributes || {},
      isVisible: node_data.isVisible || false,
      isInteractive: node_data.isInteractive || false,
      isTopElement: node_data.isTopElement || false,
      shadowRoot: node_data.shadowRoot || false,
      children: [],
      parent: parent,
    };
    if (node_data.children) {
      let children = [];
      for (let i = 0; i < node_data.children.length; i++) {
        let child = node_data.children[i];
        if (child) {
          let child_node = parse_node(child, element_node);
          if (child_node) {
            children.push(child_node);
          }
        }
      }
      element_node.children = children;
    }
    return element_node;
  }

  function build_dom_tree(markHighlightElements) {
    let highlightIndex = 0; // Reset highlight index

    function highlightElement(element, index, parentIframe = null) {
      // Create or get highlight container
      let container = document.getElementById('eko-highlight-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'eko-highlight-container';
        container.style.position = 'fixed';
        container.style.pointerEvents = 'none';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.zIndex = '2147483647'; // Maximum z-index value
        document.documentElement.appendChild(container);
      }

      // Generate a color based on the index
      const colors = [
        '#FF0000',
        '#00FF00',
        '#0000FF',
        '#FFA500',
        '#800080',
        '#008080',
        '#FF69B4',
        '#4B0082',
        '#FF4500',
        '#2E8B57',
        '#DC143C',
        '#4682B4',
      ];
      const colorIndex = index % colors.length;
      const baseColor = colors[colorIndex];
      const backgroundColor = `${baseColor}1A`; // 10% opacity version of the color

      // Create highlight overlay
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.border = `2px solid ${baseColor}`;
      overlay.style.pointerEvents = 'none';
      overlay.style.boxSizing = 'border-box';

      // Position overlay based on element
      const rect = element.getBoundingClientRect();
      let top = rect.top;
      let left = rect.left;

      if (rect.width < window.innerWidth / 2 || rect.height < window.innerHeight / 2) {
        overlay.style.backgroundColor = backgroundColor;
      }

      // Adjust position if element is inside an iframe
      if (parentIframe) {
        const iframeRect = parentIframe.getBoundingClientRect();
        top += iframeRect.top;
        left += iframeRect.left;
      }

      overlay.style.top = `${top}px`;
      overlay.style.left = `${left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;

      // Create label
      const label = document.createElement('div');
      label.className = 'eko-highlight-label';
      label.style.position = 'absolute';
      label.style.background = baseColor;
      label.style.color = 'white';
      label.style.padding = '1px 4px';
      label.style.borderRadius = '4px';
      label.style.fontSize = `${Math.min(12, Math.max(8, rect.height / 2))}px`; // Responsive font size
      label.textContent = index;

      // Calculate label position
      const labelWidth = 20; // Approximate width
      const labelHeight = 16; // Approximate height

      // Default position (top-right corner inside the box)
      let labelTop = top + 2;
      let labelLeft = left + rect.width - labelWidth - 2;

      // Adjust if box is too small
      if (rect.width < labelWidth + 4 || rect.height < labelHeight + 4) {
        // Position outside the box if it's too small
        labelTop = top - labelHeight - 2;
        labelLeft = left + rect.width - labelWidth;
      }

      // Ensure label stays within viewport
      if (labelTop < 0) labelTop = top + 2;
      if (labelLeft < 0) labelLeft = left + 2;
      if (labelLeft + labelWidth > window.innerWidth) {
        labelLeft = left + rect.width - labelWidth - 2;
      }

      label.style.top = `${labelTop}px`;
      label.style.left = `${labelLeft}px`;

      // Add to container
      container.appendChild(overlay);
      container.appendChild(label);

      // Store reference for cleanup
      element.setAttribute('eko-user-highlight-id', `eko-highlight-${index}`);

      return index + 1;
    }

    // Helper function to generate XPath as a tree
    function getXPathTree(element, stopAtBoundary = true) {
      const segments = [];
      let currentElement = element;

      while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
        // Stop if we hit a shadow root or iframe
        if (
          stopAtBoundary &&
          (currentElement.parentNode instanceof ShadowRoot ||
            currentElement.parentNode instanceof HTMLIFrameElement)
        ) {
          break;
        }

        let index = 0;
        let sibling = currentElement.previousSibling;
        while (sibling) {
          if (
            sibling.nodeType === Node.ELEMENT_NODE &&
            sibling.nodeName === currentElement.nodeName
          ) {
            index++;
          }
          sibling = sibling.previousSibling;
        }

        const tagName = currentElement.nodeName.toLowerCase();
        const xpathIndex = index > 0 ? `[${index + 1}]` : '';
        segments.unshift(`${tagName}${xpathIndex}`);

        currentElement = currentElement.parentNode;
      }

      return segments.join('/');
    }

    // Helper function to check if element is accepted
    function isElementAccepted(element) {
      const leafElementDenyList = new Set(['svg', 'script', 'style', 'link', 'meta', 'noscript', 'template']);
      return !leafElementDenyList.has(element.tagName.toLowerCase());
    }

    // Helper function to check if element is interactive
    function isInteractiveElement(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      // Base interactive elements and roles
      const interactiveElements = new Set([
        'a',
        'button',
        'details',
        'embed',
        'input',
        'label',
        'menu',
        'menuitem',
        'object',
        'select',
        'textarea',
        'summary',
        'option',
        'optgroup',
        'fieldset',
        'legend',
      ]);

      const interactiveRoles = new Set([
        'button',
        'menu',
        'menuitem',
        'menubar',
        'link',
        'checkbox',
        'radio',
        'slider',
        'tab',
        'tabpanel',
        'textbox',
        'combobox',
        'grid',
        'listbox',
        'option',
        'progressbar',
        'scrollbar',
        'searchbox',
        'switch',
        'tree',
        'treeitem',
        'spinbutton',
        'tooltip',
        'a-button-inner',
        'a-dropdown-button',
        'click',
        'menuitemcheckbox',
        'menuitemradio',
        'a-button-text',
        'button-text',
        'button-icon',
        'button-icon-only',
        'button-text-icon-only',
        'dropdown',
        'combobox',
      ]);

      const tagName = element.tagName.toLowerCase();
      const role = element.getAttribute('role');
      const ariaRole = element.getAttribute('aria-role');
      const tabIndex = element.getAttribute('tabindex');

      // Basic role/attribute checks
      const hasInteractiveRole =
        interactiveElements.has(tagName) ||
        interactiveRoles.has(role) ||
        interactiveRoles.has(ariaRole) ||
        (tabIndex !== null && tabIndex !== '-1') ||
        element.getAttribute('data-action') === 'a-dropdown-select' ||
        element.getAttribute('data-action') === 'a-dropdown-button' ||
        element.getAttribute('contenteditable') === 'true';

      if (hasInteractiveRole) return true;

      // const eventTypes = [
      //   'click',
      //   'mousedown',
      //   'mouseup',
      //   'touchstart',
      //   'touchend',
      //   'keydown',
      //   'keyup',
      //   'focus',
      //   'blur',
      // ];

      const clickEventTypes = [
        'click',
        'mousedown',
        'mouseup',
        'touchstart',
        'touchend',
      ];

      // Filter elements that have no real event listeners at all
      if (window.getEventListeners) {
        const listeners = window.getEventListeners(element);
        const hasRealClickListeners = clickEventTypes.some((type) => listeners[type]?.length > 0);
        if (!hasRealClickListeners) {
          return false;
        }
      }

      // Check for event listeners
      const hasClickHandler =
        element.onclick !== null ||
        element.getAttribute('onclick') !== null ||
        element.hasAttribute('ng-click') ||
        element.hasAttribute('@click') ||
        element.hasAttribute('v-on:click');

      // Helper function to safely get event listeners
      function getElementEventListeners(el) {
        // List of common event types to check
        const listeners = {};

        for (const type of clickEventTypes) {
          const handler = el[`on${type}`];
          if (handler) {
            listeners[type] = [
              {
                listener: handler,
                useCapture: false,
              },
            ];
          }
        }

        return listeners;
      }

      // Check for click-related events on the element itself
      const listeners = getElementEventListeners(element);
      const hasClickListeners = clickEventTypes.some((type) => listeners[type]?.length > 0);

      // Check for ARIA properties that suggest interactivity
      const hasAriaProps =
        element.hasAttribute('aria-expanded') ||
        element.hasAttribute('aria-pressed') ||
        element.hasAttribute('aria-selected') ||
        element.hasAttribute('aria-checked');

      // Check if element is draggable
      const isDraggable = element.draggable || element.getAttribute('draggable') === 'true';

      if (hasAriaProps || hasClickHandler || hasClickListeners || isDraggable) {
        return true;
      }

      // Check if element has click-like styling
      let hasClickStyling = element.style.cursor === 'pointer' || getCachedComputedStyle(element).cursor === 'pointer';
      if (hasClickStyling) {
        let count = 0;
        let current = element.parentElement;
        while (current && current !== document.documentElement) {
          hasClickStyling = current.style.cursor === 'pointer' || getCachedComputedStyle(current).cursor === 'pointer';
          if (hasClickStyling) return false;
          current = current.parentElement;
          if (++count > 10) break;
        }
        return true;
      }

      return false;
    }

    // Helper function to check if element exists
    function isElementExist(element) {
      const style = getCachedComputedStyle(element);
      return (
        style?.visibility !== 'hidden' &&
        style?.display !== 'none'
      );
    }

    // Helper function to check if element is visible
    function isElementVisible(element) {
      if (element.offsetWidth === 0 && element.offsetHeight === 0) {
        return false;
      }
      return isElementExist(element);
    }

    // Helper function to check if element is the top element at its position
    function isTopElement(element) {
      // Find the correct document context and root element
      let doc = element.ownerDocument;

      // If we're in an iframe, elements are considered top by default
      if (doc !== window.document) {
        return true;
      }

      // For shadow DOM, we need to check within its own root context
      const shadowRoot = element.getRootNode();
      if (shadowRoot instanceof ShadowRoot) {
        const rect = element.getBoundingClientRect();
        const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

        try {
          // Use shadow root's elementFromPoint to check within shadow DOM context
          const topEl = shadowRoot.elementFromPoint(point.x, point.y);
          if (!topEl) return false;

          // Check if the element or any of its parents match our target element
          let count = 0;
          let current = topEl;
          while (current && current !== shadowRoot) {
            if (current === element) return true;
            current = current.parentElement;
            if (++count > 15) break;
          }
          return false;
        } catch (e) {
          return true; // If we can't determine, consider it visible
        }
      }

      // Regular DOM elements
      const rect = element.getBoundingClientRect();
      const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

      try {
        const topEl = document.elementFromPoint(point.x, point.y);
        if (!topEl) return false;

        let count = 0;
        let current = topEl;
        while (current && current !== document.documentElement) {
          if (current === element) return true;
          current = current.parentElement;
          if (++count > 15) break;
        }
        return false;
      } catch (e) {
        return true;
      }
    }

    // Helper function to check if text node is visible
    function isTextNodeVisible(textNode) {
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const rect = range.getBoundingClientRect();

      return (
        rect.width !== 0 &&
        rect.height !== 0 &&
        rect.top >= 0 &&
        rect.top <= window.innerHeight &&
        textNode.parentElement?.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      );
    }

    // Function to traverse the DOM and create nested JSON
    function buildDomTree(node, parentIframe = null) {
      if (!node) return null;

      // Special case for text nodes
      if (node.nodeType === Node.TEXT_NODE) {
        const textContent = node.textContent.trim();
        if (textContent && isTextNodeVisible(node)) {
          return {
            type: 'TEXT_NODE',
            text: textContent,
            isVisible: true,
          };
        }
        return null;
      }

      // Check if element is accepted
      if (node.nodeType === Node.ELEMENT_NODE && !isElementAccepted(node)) {
        return null;
      }

      const nodeData = {
        tagName: node.tagName ? node.tagName.toLowerCase() : null,
        attributes: {},
        xpath: node.nodeType === Node.ELEMENT_NODE ? getXPathTree(node, true) : null,
        children: [],
      };

      // Copy all attributes if the node is an element
      if (node.nodeType === Node.ELEMENT_NODE && node.attributes) {
        // Use getAttributeNames() instead of directly iterating attributes
        const attributeNames = node.getAttributeNames?.() || [];
        for (const name of attributeNames) {
          nodeData.attributes[name] = node.getAttribute(name);
        }
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const isInteractive = isInteractiveElement(node);
        const isVisible = isElementVisible(node);
        const isTop = isTopElement(node);

        nodeData.isInteractive = isInteractive;
        nodeData.isVisible = isVisible;
        nodeData.isTopElement = isTop;

        // For Shadow DOM elements, use more lenient criteria
        const isInShadowDOM = node.getRootNode() instanceof ShadowRoot;
        const shouldHighlight = isInteractive && isVisible && (isTop || isInShadowDOM);

        // Highlight if element meets all criteria and highlighting is enabled
        if (shouldHighlight) {
          nodeData.highlightIndex = highlightIndex++;
          window.clickable_elements[nodeData.highlightIndex] = node;
          if (markHighlightElements) {
            highlightElement(node, nodeData.highlightIndex, parentIframe);
          }
        }
      }

      // Only add iframeContext if we're inside an iframe
      // if (parentIframe) {
      //     nodeData.iframeContext = `iframe[src="${parentIframe.src || ''}"]`;
      // }

      // Only add shadowRoot field if it exists
      if (node.shadowRoot) {
        nodeData.shadowRoot = true;
      }

      // Handle shadow DOM
      if (node.shadowRoot) {
        const shadowChildren = Array.from(node.shadowRoot.childNodes).map((child) =>
          buildDomTree(child, parentIframe)
        );
        nodeData.children.push(...shadowChildren);
      }

      // Handle iframes
      if (node.tagName === 'IFRAME') {
        try {
          const iframeDoc = node.contentDocument || node.contentWindow.document;
          if (iframeDoc) {
            const iframeChildren = Array.from(iframeDoc.body.childNodes).map((child) =>
              buildDomTree(child, node)
            );
            nodeData.children.push(...iframeChildren);
          }
        } catch (e) {
          console.warn('Unable to access iframe:', node);
        }
      } else {
        if (isElementExist(node)) {
          const children = Array.from(node.childNodes).map((child) =>
            buildDomTree(child, parentIframe)
          );
          nodeData.children.push(...children);
        }
      }

      return nodeData;
    }
    return buildDomTree(document.body);
  }

  window.get_clickable_elements = get_clickable_elements;
  window.get_highlight_element = get_highlight_element;
  window.remove_highlight = remove_highlight;
}