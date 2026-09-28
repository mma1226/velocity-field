# Velocity Field

A lightweight, framework-free generative canvas tool for animated horizontal light fields.

Open `index.html` directly, or serve this folder with any static web server. Each field begins on a blank black frame and ignites through a fast burst of light before settling into continuous motion. The v3 palette keeps modal green (#7FEE64), chrome/silver, white, and black as the permanent core, then chooses a restrained accent mood per seed — violet, blue/cyan, magenta, acid-lime, or warm oxide — so secondary and tertiary colors can permeate without becoming colorful. The Color Range slider controls how strongly those secondary hues appear. Visible beam motion is biased left-to-right and each new field gets a short high-speed launch surge before settling; vertical drift is deliberately stabilized during that entry burst so the bands draw in smoothly instead of bobbing. A distinct passing-streak layer now runs over the stable field: shorter, brighter beams enter from the left, cut across, fade at the head and tail, and regenerate independently. Controls cover intensity, density, color range, speed, and subtle localized flicker. Beams evolve through independent generations: each exit produces a new path, tint, thickness, timing, internal detail, and companion color, while the persistent structure wanders continuously through smooth procedural noise.

Keyboard shortcuts:

- `Space` pauses or resumes the field.
- `R` generates a new seed.
